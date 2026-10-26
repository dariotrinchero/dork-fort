"""The update screen: every entry of every tracked collection, fuzzy-filtered as you type, with quick actions.

Two modes: typing (the default), where keys go to the query & Ctrl+letter acts on the highlighted entry, & the
list (↓ from the query), where bare letters act. Tab cycles a filter by collection in both."""

import curses
from pathlib import Path

from .. import actions
from ..actions import ROLE_ORDER, creator, role_of
from ..vault import Entry
from .base import BACKSPACES, ENTER, ESC, TAB, Help, LineEdit, Stars, attr, ctrl, dwidth, fit, put, runs

# what each collection's entries are labelled (films by their kind)
LABELS = {"novels": "novel", "nonfiction": "nonfic", "films": "film", "games": "game"}

# quick actions' keys, in the list & (with Ctrl) while typing
KEYS = {"f": "finish", "s": "start", "p": "pause", "d": "dnf", "r": "rate"}
CTRL_KEYS = {ctrl(letter): action for letter, action in KEYS.items()}

HELP = [
    ("typing", "filters (fuzzy, as fzf): titles & who made them"),
    ("↓", "into the list (to the next entry)"),
    ("⇥  ⇧⇥", "filter by collection"),
    ("⏎", "edit the highlighted entry"),
    ("^F ^S ^P ^D", "finish / start / pause / dnf it (today's date)"),
    ("^R", "rate it"),
    ("^Z", "undo the last change"),
    ("esc", "clear the query, or quit"),
    ("", ""),
    ("in the list:", ""),
    ("↑↓ j k", "move (↑ from the top: back to typing)"),
    ("PgUp PgDn g G", "page, first, last"),
    ("f s p d r", "finish / start / pause / dnf / rate"),
    ("⏎ e", "edit"),
    ("u", "undo the last change"),
    ("/ esc", "back to typing"),
    ("q", "quit"),
]


class Finder:
    overlay = False
    app = None

    def __init__(self, query: str = "", armed: str | None = None, rating=None):
        self.query = LineEdit(query)
        self.typing = True
        self.sel = self.top = 0
        self.filter = 0              # index into self.filters (0: all)
        self.armed, self.rating = armed, rating # action Enter does (when dork was told one on the command line)
        self.anchor: Path | None = None         # selected entry, to find again when entries are reloaded
        self._key, self._results = None, []

    @property
    def filters(self) -> list[str]: return ["all", *self.app.names]

    def results(self) -> list[tuple[Entry, set[int]]]:
        """Entries shown: matching the query (best first), or else all (in progress first, then most recently
        changed), of the filtered collection."""
        key = (self.query.text, self.filter, self.app.version)
        if key == self._key: return self._results
        changed_query = self._key is None or self._key[:2] != key[:2]
        self._key = key

        pool = self.app.entries
        if self.filter: pool = [e for e in pool if e.collection == self.filters[self.filter]]
        if self.query.text.strip():
            self._results = [(e, indices) for e, indices, _ in actions.rank(self.app.schema, pool, self.query.text)]
        else:
            order = {role: i for i, role in enumerate(ROLE_ORDER)}
            pool = sorted(pool, key=lambda e: (order.get(role_of(self.app.schema, e), 9), -self.app.mtimes[e.path]))
            self._results = [(e, set()) for e in pool]

        # a new query starts at its best match; reloaded entries keep the one selected
        paths = [e.path for e, _ in self._results]
        self.sel = 0 if changed_query or self.anchor not in paths else paths.index(self.anchor)
        self.anchor = paths[self.sel] if paths else None
        return self._results

    def selected(self) -> Entry | None:
        results = self.results()
        return results[self.sel][0] if results else None

    def move(self, delta: int):
        results = self.results()
        if not results: return
        self.sel = max(0, min(len(results) - 1, self.sel + delta))
        self.anchor = results[self.sel][0].path

    #---- doing things ------------------------------------------------------------------------

    def act(self, action: str):
        entry = self.selected()
        if not entry: return self.app.notify("nothing selected", ok=False)
        if action == "rate" and (self.rating is None or self.armed != "rate"):
            title = str(entry.fields.get("title") or entry.slug)
            return self.app.push(Stars(title, entry.fields.get("rating"),
                                       lambda rating: self.done(actions.act(self.app.schema, entry, "rate", rating))))
        self.done(actions.act(self.app.schema, entry, action, self.rating))

    def done(self, outcome: actions.Outcome):
        """Report what an action did; when armed by the command line, a success also ends dork."""
        self.app.record(outcome)
        if self.armed and not outcome.failed:
            self.app.result = outcome.message
            self.app.running = False

    def edit(self):
        from .editor import Editor
        entry = self.selected()
        if entry: self.app.push(Editor(entry))

    def handle(self, key: int, ch):
        if key == TAB: self.filter = (self.filter + 1) % len(self.filters)
        elif key == curses.KEY_BTAB: self.filter = (self.filter - 1) % len(self.filters)
        elif key in ENTER: self.act(self.armed) if self.armed else self.edit()
        elif self.typing: self.handle_typing(key, ch)
        else: self.handle_list(key, ch)

    def handle_typing(self, key: int, ch):
        if key in CTRL_KEYS: self.act(CTRL_KEYS[key])
        elif key == ctrl("z"): self.app.undo()
        elif key == curses.KEY_DOWN: # into the list, moving down as ↓ always does (^-keys act on the top)
            if self.results():
                self.typing = False
                self.move(1)
        elif key == curses.KEY_UP: pass
        elif key == ESC:
            if self.query.text: self.query = LineEdit()
            else: self.app.running = False
        elif key in BACKSPACES and not self.query.text and self.filter: self.filter = 0
        else: self.query.handle(key, ch)

    def handle_list(self, key: int, ch):
        rows = self.rows()
        if key in (curses.KEY_DOWN, ord("j")): self.move(1)
        elif key in (curses.KEY_UP, ord("k")):
            if self.sel == 0: self.typing = True
            else: self.move(-1)
        elif key == curses.KEY_NPAGE: self.move(rows - 1)
        elif key == curses.KEY_PPAGE: self.move(1 - rows)
        elif key in (curses.KEY_HOME, ord("g")): self.move(-len(self.results()))
        elif key in (curses.KEY_END, ord("G")): self.move(len(self.results()))
        elif isinstance(ch, str) and ch in KEYS: self.act(KEYS[ch])
        elif key in CTRL_KEYS: self.act(CTRL_KEYS[key])
        elif key == ord("e"): self.edit()
        elif key in (ord("u"), ctrl("z")): self.app.undo()
        elif key in (ord("/"), ord("i"), ESC): self.typing = True
        elif key == ord("q"): self.app.running = False
        elif key == ord("?"): self.app.push(Help("Keys", HELP))

    #---- drawing -----------------------------------------------------------------------------

    def rows(self) -> int: return max(1, self.app.scr.getmaxyx()[0] - 4)

    def draw(self, win):
        h, w = win.getmaxyx()
        results = self.results()

        # collection tabs, & how many match
        x = put(win, 0, 0, " dork ", attr("ink", "accent", bold=True)) + 1
        for i, name in enumerate(self.filters):
            current = i == self.filter
            x = put(win, 0, x, f" {name} ", attr("accent" if current else "dim", bold=current, underline=current))
        count = f"{len(results)}/{len(self.app.entries)} "
        put(win, 0, w - dwidth(count), count, attr("dim"))

        # query
        prompt = attr("accent", bold=True) if self.typing else attr("dim")
        put(win, 1, 1, "›", prompt)
        badge = f" ⏎ {self.armed} " if self.armed else ""
        self.query.draw(win, 1, 3, w - 5 - dwidth(badge), curses.A_BOLD if self.typing else attr("dim"), self.typing)
        if badge: put(win, 1, w - dwidth(badge) - 1, badge, attr("ink", "green", bold=True))
        put(win, 2, 0, "─" * w, attr("dim"))

        # entries
        rows = self.rows()
        self.top = max(min(self.top, self.sel), self.sel - rows + 1, 0)
        for i, (entry, indices) in enumerate(results[self.top:self.top + rows]):
            self.draw_entry(win, 3 + i, w, entry, indices, self.top + i == self.sel)
        if not results: put(win, 3, 2, "no matches" if self.query.text.strip() else "no entries", attr("dim"))
        self.app.footer(win, h - 1, self.hints())

    def draw_entry(self, win, y: int, w: int, entry: Entry, indices: set[int], chosen: bool):
        bg = "bar" if chosen else "bg" # shown while typing too: Ctrl+letter acts on it
        if chosen: put(win, y, 0, " " * w, attr(bg=bg))
        put(win, y, 0, "▸" if chosen else " ", attr("accent", bg, bold=True))

        fields, schema = entry.fields, self.app.schema
        label = fields.get("kind") if entry.collection == "films" and fields.get("kind") else LABELS[entry.collection]
        role = role_of(schema, entry)
        status = str(fields.get("status") or "")
        rating = fields.get("rating")
        rated = actions.stars(rating) if isinstance(rating, (int, float)) and 1 <= rating <= 5 else ""
        year = str(fields.get("year") or "")
        title = str(fields.get("title") or entry.slug)
        who = creator(entry)

        # columns, from the right: stars, status, year, who made it; the title takes the rest
        stars_x = w - 6
        status_x = stars_x - 10
        year_x = status_x - 6
        who_width = max(0, min(24, (year_x - 9) // 3))
        who_x = year_x - who_width - 2
        title_width = max(1, (who_x if who_width else year_x) - 9 - 2)

        put(win, y, 2, fit(label, 7), attr(entry.collection, bg))
        hits = attr("accent", bg, bold=True)
        self.draw_matched(win, y, 9, title, 0, indices, title_width, attr("fg", bg, bold=chosen), hits)
        if who_width: self.draw_matched(win, y, who_x, who, len(title) + 2, indices, who_width, attr("dim", bg), hits)
        put(win, y, year_x, year[:4], attr("dim", bg))
        colour = schema["roles"][role]["colour"] if role else "error"
        put(win, y, status_x, fit(status, 9), attr(colour, bg))
        put(win, y, stars_x, rated, attr("accent", bg))

    @staticmethod
    def draw_matched(win, y, x, text, offset, indices, width, plain, hit):
        """Draw text in width columns, its characters at indices (less offset) of the haystack in hit's style."""
        if dwidth(text) > width: text = fit(text, width)
        segments: list[tuple[str, int]] = []
        for i, ch in enumerate(text):
            style = hit if i + offset in indices and ch != "…" else plain
            if segments and segments[-1][1] == style: segments[-1] = (segments[-1][0] + ch, style)
            else: segments.append((ch, style))
        runs(win, y, x, segments, width)

    def hints(self) -> list[str]:
        if self.armed:
            return [f"⏎ {self.armed} the highlighted entry · ↑↓ choose · esc quit",
                    f"⏎ {self.armed} · esc quit"]
        if self.typing:
            return ["⏎ edit · ↓ list · ⇥ collection · ^F finish ^S start ^P pause ^D dnf ^R rate · ^Z undo",
                    "⏎ edit · ↓ list · ^F ^S ^P ^D ^R · ^Z undo", "⏎ edit · ↓ list"]
        return ["f finish  s start  p pause  d dnf  r rate  ⏎ edit  u undo  / search  ? help  q quit",
                "f s p d r · ⏎ edit · u undo · ? help", "? help"]
