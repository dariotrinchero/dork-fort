"""The editor: an entry's frontmatter, a row per field (& one for its filename), each edited as its type wants.
Status, enums & booleans cycle with ←/→, ratings step in quarter stars, & everything else is typed. Values the
build would reject show in red, with the reason in the footer, & block writing."""

import curses
import re

from .. import actions
from ..actions import Outcome, today, with_role
from ..slugs import make_slug
from ..validate import check_entry, is_empty
from ..vault import Entry, same, save
from .base import BACKSPACES, ENTER, ESC, Confirm, Help, LineEdit, Stars, attr, dwidth, fit, meter, put, step_rating

CYCLED = ("status", "enum", "bool")

HELP = [
    ("↑↓ j k", "move between fields"),
    ("← → h l", "change status, kind, true/false; rating by ¼"),
    ("⏎", "edit the field (or rate, or change)"),
    ("1–5 0", "rating: whole stars, or none"),
    ("t", "dates: today"),
    ("x ⌫", "clear the field"),
    ("u", "undo changes to the field"),
    ("w", "write"),
    ("e", "write, then add a review in $EDITOR"),
    ("esc q", "back (asks, if there are changes)"),
]

# tidying of what is typed (or pasted) into fields of each type, eg. a DOI's URL to the DOI
TIDY = {
    "isbn": lambda text: re.sub(r"[\s-]", "", text).upper(),
    "doi": lambda text: re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", text, flags=re.I),
    "arxiv": lambda text: re.sub(r"^(?:https?://arxiv\.org/(?:abs|pdf)/|arxiv:\s*)", "", text, flags=re.I)
        .removesuffix(".pdf"),
    "tmdb": lambda text: (lambda m: f"{m[1]}/{m[2]}" if m else text)(
        re.search(r"themoviedb\.org/(movie|tv)/(\d+)", text)),
    "igdb": lambda text: (lambda m: m[1] if m else text)(re.search(r"igdb\.com/games/([a-z0-9-]+)", text)),
}


def as_text(value) -> str:
    """Value as typed into a field."""
    if value is None: return ""
    if isinstance(value, list): return ", ".join(map(str, value))
    if isinstance(value, float) and value.is_integer(): return str(int(value))
    return str(value)


def from_text(kind: str, text: str):
    """Value of field of kind typed as text (left as text if it isn't one, to show as an error)."""
    text = TIDY.get(kind, lambda t: t)(text.strip())
    if not text: return [] if kind == "list" else None
    if kind == "list": return [item.strip() for item in text.split(",") if item.strip()]
    if kind in ("year", "count") and re.fullmatch(r"-?\d+", text): return int(text)
    if kind in ("number", "rating"):
        try: number = float(text)
        except ValueError: return text
        return int(number) if number.is_integer() else number
    return text


class Editor:
    overlay = False
    app = None

    def __init__(self, entry: Entry, new: bool = False):
        self.entry, self.new = entry, new
        self.sel = self.top = 0
        self.editing: LineEdit | None = None
        self.manual: set[str] = set() # fields changed by hand (so a change of status doesn't stamp over them)

    def opened(self):
        schema, entry = self.app.schema, self.entry
        self.collection = schema["collections"][entry.collection]
        self.order = self.app.orders[entry.collection]
        self.kinds = {key: field["type"] for key, field in self.collection["fields"].items()}
        self.keys = [*self.order, *(key for key in entry.fields if key not in self.order)]
        self.fields = {key: entry.fields.get(key) for key in self.keys}
        self.slug, self.slug_manual = entry.slug, not self.new
        self.follow()

    #---- state -------------------------------------------------------------------------------

    @property
    def rows(self) -> list[str]: return ["file", *self.keys]

    @property
    def key(self) -> str: return self.rows[self.sel]

    def kind(self, key: str) -> str: return self.kinds.get(key, "text")

    def to_save(self) -> dict:
        """Fields as they'd be written: those the note had, & any others given a value."""
        return {k: v for k, v in self.fields.items() if k in self.entry.fields or not is_empty(v)}

    def dirty(self) -> bool:
        saved = self.entry.fields
        return self.new or self.slug != self.entry.slug or \
            any(k not in saved or not same(v, saved[k]) for k, v in self.to_save().items())

    def problems(self) -> dict[str, str]:
        """What is wrong with each field (by row: "file" for the slug)."""
        found: dict[str, str] = {}
        for field, message in check_entry(self.app.schema, self.entry.collection, self.slug, self.to_save()):
            found.setdefault("file" if field == "slug" else field, message)
        if self.slug != self.entry.slug and (self.entry.path.parent / f"{self.slug}.md").exists():
            found.setdefault("file", f"{self.slug}.md already exists")
        return found

    def follow(self):
        """A new entry's slug follows its fields (as the schema's rule makes it), until edited by hand."""
        rule = self.collection["slug"].get("from")
        if not self.slug_manual and rule: self.slug = make_slug(rule, self.fields) or self.slug

    def set(self, key: str, value, by_hand: bool = True):
        if key == "file":
            self.slug, self.slug_manual = value or self.entry.slug, True
            return
        self.fields[key] = value
        if by_hand: self.manual.add(key)
        self.follow()

    #---- changing fields ---------------------------------------------------------------------

    def cycle(self, delta: int):
        key, kind = self.key, self.kind(self.key)
        value = self.fields.get(key)
        if kind == "status":
            words = list(self.collection["status"].values())
            word = words[(words.index(value) + delta) % len(words)] if value in words else words[0]
            role = next(role for role, w in self.collection["status"].items() if w == word)
            # dates stamped by an earlier change of status go back to what they were, unless set by hand
            stamps = {r["stamps"] for r in self.app.schema["roles"].values() if "stamps" in r}
            stamped = {k: self.entry.fields.get(k) for k in stamps if k not in self.manual and k in self.fields}
            self.fields = with_role(self.app.schema, self.entry, self.fields, role, stamped)
            self.follow()
        elif kind == "enum":
            values = self.collection["fields"][key]["values"]
            i = values.index(value) + delta if value in values else (0 if delta > 0 else -1)
            self.set(key, values[i % len(values)])
        elif kind == "bool": self.set(key, not value)
        elif kind == "rating": self.set(key, step_rating(value if isinstance(value, (int, float)) else None, delta / 4))
        else: self.app.notify("⏎ to edit this one")

    def enter(self):
        key, kind = self.key, self.kind(self.key)
        if kind in CYCLED: self.cycle(1)
        elif kind == "rating":
            title = str(self.fields.get("title") or self.slug)
            self.app.push(Stars(title, self.fields.get(key), lambda rating: self.set(key, rating)))
        else: self.editing = LineEdit(self.slug if key == "file" else as_text(self.fields.get(key)))

    def commit(self):
        key, text = self.key, self.editing.text
        self.editing = None
        self.set(key, text.strip() if key == "file" else from_text(self.kind(key), text))

    def clear(self):
        key = self.key
        if key == "file": return self.app.notify("u restores the filename")
        self.set(key, [] if self.kind(key) == "list" else None)

    def undo_field(self):
        key = self.key
        if key == "file":
            self.slug, self.slug_manual = self.entry.slug, not self.new
            self.follow()
        else:
            self.fields[key] = self.entry.fields.get(key)
            self.manual.discard(key)
            self.follow()

    def write(self, then_edit: bool = False):
        problems = self.problems()
        if problems:
            field, message = next(iter(problems.items()))
            more = f" (& {len(problems) - 1} more)" if len(problems) > 1 else ""
            return self.app.notify(f"can't write: {field} {message}{more}", ok=False)

        if self.dirty():
            fields = self.to_save()
            changes = save(self.entry, fields, self.order, self.kinds, self.slug)
            message = actions.describe(self.app.schema, self.entry, self.entry.fields, fields, self.slug)
            self.app.record(Outcome(message, changes=changes))
        path = self.entry.path.with_name(f"{self.slug}.md")
        self.app.pop(self)
        if then_edit: self.app.edit_body(path)

    def back(self):
        if self.dirty(): self.app.push(Confirm(f"Discard changes to {self.entry.file}?", lambda: self.app.pop(self)))
        else: self.app.pop(self)

    def handle(self, key: int, ch):
        if self.editing:
            if key in ENTER: self.commit()
            elif key == ESC: self.editing = None
            else: self.editing.handle(key, ch)
            return

        kind = self.kind(self.key)
        if key in (curses.KEY_DOWN, ord("j")): self.sel = min(len(self.rows) - 1, self.sel + 1)
        elif key in (curses.KEY_UP, ord("k")): self.sel = max(0, self.sel - 1)
        elif key in (curses.KEY_HOME, ord("g")): self.sel = 0
        elif key in (curses.KEY_END, ord("G")): self.sel = len(self.rows) - 1
        elif key in (curses.KEY_RIGHT, ord("l")): self.cycle(1)
        elif key in (curses.KEY_LEFT, ord("h")): self.cycle(-1)
        elif key in ENTER: self.enter()
        elif kind == "rating" and ord("0") <= key <= ord("5"): self.set(self.key, key - ord("0") or None)
        elif key == ord("t") and kind in ("date", "partial-date"): self.set(self.key, today())
        elif key in (ord("x"), curses.KEY_DC, *BACKSPACES): self.clear()
        elif key == ord("u"): self.undo_field()
        elif key == ord("w"): self.write()
        elif key == ord("e"): self.write(then_edit=True)
        elif key in (ESC, ord("q"), ord("b")): self.back()
        elif key == ord("?"): self.app.push(Help("Editor keys", HELP))

    #---- drawing -----------------------------------------------------------------------------

    def show(self, key: str) -> tuple[str, str, bool]:
        """Value of row as shown: its text, colour, & whether it is bold."""
        if key == "file": return f"{self.slug}.md", "fg", False
        value, kind = self.fields.get(key), self.kind(key)
        if kind == "status" and value is not None:
            role = next((r for r, w in self.collection["status"].items() if w == value), None)
            return f"◂ {value} ▸", self.app.schema["roles"][role]["colour"] if role else "fg", True
        if kind == "bool": return f"◂ {'true' if value else 'false'} ▸", "green" if value else "dim", False
        if kind == "rating":
            number = value if isinstance(value, (int, float)) and not isinstance(value, bool) else None
            return f"{meter(number)}  {as_text(value) or '—'}", "accent" if number else "dim", False
        if kind == "enum" and value is not None: return f"◂ {value} ▸", "fg", False
        if is_empty(value): return "—", "dim", False
        return as_text(value), "fg", False

    def draw(self, win):
        h, w = win.getmaxyx()
        problems = self.problems()
        x = put(win, 0, 0, " dork ", attr("ink", "accent", bold=True)) + 1
        put(win, 0, x, f"{'new' if self.new else 'edit'}  {self.entry.collection}/{self.slug}.md", curses.A_BOLD)
        if self.dirty(): put(win, 0, w - 11, "● unsaved", attr("accent"))
        put(win, 1, 0, "─" * w, attr("dim"))

        label = max(map(dwidth, self.rows)) + 2
        room = max(1, h - 3)
        self.top = max(min(self.top, self.sel), self.sel - room + 1, 0)
        for i, key in enumerate(self.rows[self.top:self.top + room]):
            y, chosen = 2 + i, self.top + i == self.sel
            bg = "bar" if chosen else "bg"
            if chosen: put(win, y, 0, " " * w, attr(bg=bg))
            put(win, y, 0, "▸" if chosen else " ", attr("accent", bg, bold=True))
            wrong = key in problems
            put(win, y, 2, key, attr("error" if wrong else "accent" if chosen else "dim", bg))
            if chosen and self.editing:
                self.editing.draw(win, y, 2 + label, w - label - 3, attr("fg", bg, bold=True))
                continue
            text, colour, bold = self.show(key)
            put(win, y, 2 + label, fit(text, w - label - 3).rstrip(), attr("error" if wrong else colour, bg, bold=bold))

        note = problems.get(self.key)
        self.app.footer(win, h - 1, self.hints(), f"{self.key} {note}" if note else None)

    def hints(self) -> list[str]:
        if self.editing:
            return ["⏎ done · esc cancel · ^A ^E start/end · ^W word · ^U clear", "⏎ done · esc cancel"]
        kind = self.kind(self.key)
        change = "←→ change · " if kind in (*CYCLED, "rating") else "⏎ edit · "
        today_ = "t today · " if kind in ("date", "partial-date") else ""
        return [f"{change}{today_}x clear · u undo · w write · e write + review · esc back · ? help",
                f"{change}w write · e + review · esc back", "w write · esc back"]
