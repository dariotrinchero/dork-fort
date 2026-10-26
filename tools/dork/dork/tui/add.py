"""The add screen: a tab per tracked collection, each searching its source; picking a hit opens the editor on a
new entry, filled in from it. Hits already in the vault are marked, & open the entry there instead.

Nothing is fetched until asked for: Enter searches the current tab, & arriving with a query (from the command line,
or ^A from the finder) counts as asked, searching every tab at once (a request each) if no collection was given.
Results are kept for the session, so switching tabs or going back from the editor costs nothing. Zotero is read
from disk, so its tab searches as you type."""

import curses
import textwrap
from concurrent.futures import Future
from dataclasses import dataclass, field

from ..actions import creator, fold
from ..net import NetError
from ..slugs import make_slug, surname
from ..sources import Candidate, Source, sources
from ..vault import Entry, new_entry
from .base import ENTER, ESC, TAB, Help, LineEdit, attr, ctrl, dwidth, fit, put, runs, who_width

HELP = [
    ("typing", "the query"),
    ("⏎", "search (or, once searched, open the top hit)"),
    ("⇥  ⇧⇥", "switch collection (or ←→, with no query)"),
    ("^U ^T", "to the finder (taking the query)"),
    ("↓", "into the list"),
    ("^Z", "undo the last change (eg. an entry added)"),
    ("esc", "clear the query, or go back"),
    ("", ""),
    ("in the list:", ""),
    ("↑↓ j k", "move (↑ from the top: back to typing)"),
    ("⏎ e", "open the hit in the editor (filled in; one more request, for some)"),
    ("←→ h l", "switch collection"),
    ("u", "undo the last change"),
    ("space /", "back to typing"),
    ("q", "go back"),
]


@dataclass
class Tab:
    """A collection's hits, & how its search stands."""
    collection: str
    source: Source
    searched: str | None = None # query its hits are for
    job: Future | None = None
    hits: list[Candidate] = field(default_factory=list)
    error: str = ""
    sel: int = 0
    top: int = 0


class Add:
    overlay = False
    app = None

    def __init__(self, query: str = "", collection: str | None = None, search: bool = False):
        self.query = LineEdit(query)
        self.typed = collection     # the collection dork was given, if any (else a query given searches every tab)
        self.search_now = search and bool(query.strip())
        self.typing = True
        self.opening: tuple[Future, Tab] | None = None # a hit being filled in, to open once it is
        self._existing: dict[tuple, Entry | None] = {}

    def opened(self):
        found = sources()
        self.tabs = [Tab(name, found[name]) for name in self.app.names if name in found]
        names = [tab.collection for tab in self.tabs]
        self.current = names.index(self.typed) if self.typed in names else 0
        self.live()
        if self.search_now: self.submit(everywhere=not self.typed)

    @property
    def tab(self) -> Tab: return self.tabs[self.current]

    @property
    def busy(self) -> bool: return bool(self.opening) or any(tab.job for tab in self.tabs)

    #---- searching ---------------------------------------------------------------------------

    def submit(self, everywhere: bool = False):
        """Search the current tab for the query (or with everywhere, every tab)."""
        for tab in self.tabs if everywhere else [self.tab]: self.search(tab)

    def search(self, tab: Tab):
        query = self.query.text.strip()
        if not query or tab.source.local or tab.job or tab.searched == query: return
        tab.searched, tab.hits, tab.error, tab.sel, tab.top = query, [], "", 0, 0
        if problem := tab.source.problem(): tab.error = f"{tab.source.label} {problem}"
        else: tab.job = self.app.pool.submit(tab.source.search, query)

    def live(self):
        """Search tabs read from disk as the query changes (there's nothing to spare)."""
        query = self.query.text.strip()
        for tab in self.tabs:
            if not tab.source.local or tab.searched == query: continue
            tab.searched, tab.sel, tab.top = query, 0, 0
            if problem := tab.source.problem(): tab.hits, tab.error = [], f"{tab.source.label} {problem}"
            else:
                try: tab.hits, tab.error = tab.source.search(query), ""
                except Exception as exc: tab.hits, tab.error = [], f"{tab.source.label}: {exc}" # eg. a locked database

    def poll(self):
        for tab in self.tabs:
            if tab.job and tab.job.done():
                job, tab.job = tab.job, None
                try: tab.hits = job.result()
                except NetError as exc: tab.error = str(exc)
                except Exception as exc: tab.error = f"{tab.source.label}: {type(exc).__name__}: {exc}"

        if self.opening and self.opening[0].done():
            (job, tab), self.opening = self.opening, None
            try: hit = job.result()
            except NetError as exc: return self.app.notify(f"couldn't fill it in: {exc}", ok=False)
            tab.hits = [hit if h.id == hit.id else h for h in tab.hits] # filled in, for next time
            self.edit(tab, hit)

    #---- opening hits ------------------------------------------------------------------------

    def existing(self, tab: Tab, hit: Candidate) -> Entry | None:
        """Entry already in the vault that hit is, if any: by slug, by id (eg. TMDB's), or by title, with the year &
        who made it agreeing (where both have them)."""
        key = (tab.collection, hit.id, hit.complete, self.app.version)
        if key not in self._existing: self._existing[key] = self._find(tab, hit)
        return self._existing[key]

    def _find(self, tab: Tab, hit: Candidate) -> Entry | None:
        rule = self.app.schema["collections"][tab.collection]["slug"].get("from")
        slug = hit.extra.get("slug") or (make_slug(rule, hit.fields) if rule else None)
        ids = {k: v for k, v in hit.fields.items() if k in ("tmdb", "igdb", "isbn") and v}
        title = fold(hit.title).lower()
        maker = fold(surname(hit.creator)).lower() if hit.creator else ""
        for entry in self.app.entries:
            if entry.collection != tab.collection: continue
            if entry.slug == slug or any(entry.fields.get(k) == v for k, v in ids.items()): return entry
            if fold(str(entry.fields.get("title") or "")).lower() != title: continue
            year, theirs = str(entry.fields.get("year") or ""), creator(entry)
            if hit.year and year and year != hit.year: continue
            if maker and theirs and fold(surname(theirs)).lower() != maker: continue
            if (hit.year and year) or (maker and theirs): return entry # something besides the title agrees
        return None

    def open(self):
        tab = self.tab
        if not tab.hits or self.opening: return
        hit = tab.hits[tab.sel]
        if entry := self.existing(tab, hit):
            from .editor import Editor
            self.app.notify(f"already in the vault, as {entry.file}")
            return self.app.push(Editor(entry))
        if hit.complete: return self.edit(tab, hit)
        self.opening = (self.app.pool.submit(tab.source.fill, hit), tab)

    def edit(self, tab: Tab, hit: Candidate):
        from .editor import Editor
        self.app.push(Editor(new_entry(self.app.schema, tab.collection, self.app.content), new=True, candidate=hit))

    #---- keys --------------------------------------------------------------------------------

    def switch(self, delta: int):
        self.current = (self.current + delta) % len(self.tabs)

    def take(self, query: str, collection: str | None = None):
        """Take the query (& the collection, if one) from the finder, when switched to from it."""
        if query.strip() and query != self.query.text:
            self.query = LineEdit(query)
            self.live()
        if collection: self.current = [tab.collection for tab in self.tabs].index(collection)
        self.typing = True

    def back(self):
        """Back to the finder (if dork has one open), else out."""
        if self.app.has_other(self): self.app.switch(self)
        else: self.app.pop(self)

    def move(self, delta: int):
        tab = self.tab
        if tab.hits: tab.sel = max(0, min(len(tab.hits) - 1, tab.sel + delta))

    def handle(self, key: int, ch):
        if self.opening and key == ESC:
            self.opening = None # it's left to finish, unheard
            return self.app.notify("cancelled")
        if key == TAB: self.switch(1)
        elif key == curses.KEY_BTAB: self.switch(-1)
        elif key in (ctrl("u"), ctrl("t")): self.app.switch(self)
        elif self.typing: self.handle_typing(key, ch)
        else: self.handle_list(key, ch)

    def handle_typing(self, key: int, ch):
        query = self.query.text.strip()
        if key in ENTER:
            if self.tab.hits and self.tab.searched == query: self.open()
            else: self.submit()
        elif key == curses.KEY_DOWN:
            if self.tab.hits:
                self.typing = False
                self.move(1)
        elif key == curses.KEY_UP: pass
        elif key in (curses.KEY_LEFT, curses.KEY_RIGHT) and not self.query.text:
            self.switch(1 if key == curses.KEY_RIGHT else -1)
        elif key == ctrl("z"): self.app.undo()
        elif key == ESC:
            if self.query.text: self.query = LineEdit()
            else: self.back()
        else: self.query.handle(key, ch)
        self.live()

    def handle_list(self, key: int, ch):
        if key in (curses.KEY_DOWN, ord("j")): self.move(1)
        elif key in (curses.KEY_UP, ord("k")):
            if self.tab.sel == 0: self.typing = True
            else: self.move(-1)
        elif key == curses.KEY_NPAGE: self.move(10)
        elif key == curses.KEY_PPAGE: self.move(-10)
        elif key in (curses.KEY_HOME, ord("g")): self.move(-len(self.tab.hits))
        elif key in (curses.KEY_END, ord("G")): self.move(len(self.tab.hits))
        elif key in (*ENTER, ord("e")): self.open()
        elif key in (curses.KEY_RIGHT, ord("l")): self.switch(1)
        elif key in (curses.KEY_LEFT, ord("h")): self.switch(-1)
        elif key in (ord("u"), ctrl("z")): self.app.undo()
        elif key in (ord(" "), ord("/"), ord("i"), ESC): self.typing = True
        elif key == ord("q"): self.back()
        elif key == ord("?"): self.app.push(Help("Add keys", HELP))

    #---- drawing -----------------------------------------------------------------------------

    def draw(self, win):
        h, w = win.getmaxyx()
        x = put(win, 0, 0, " dork ", attr("ink", "accent", bold=True))
        x = put(win, 0, x + 1, "add", curses.A_BOLD) + 2
        for i, tab in enumerate(self.tabs):
            count = self.app.spinner() if tab.job else "!" if tab.error else \
                str(len(tab.hits)) if tab.searched else ""
            current = i == self.current
            label = f" {tab.collection}{' ' + count if count else ''} "
            x = put(win, 0, x, label, attr("accent" if current else "dim", bold=current, underline=current))
        source = f"{self.tab.source.label} "
        put(win, 0, w - dwidth(source), source, attr("dim"))

        put(win, 1, 1, "›", attr("accent", bold=True) if self.typing else attr("dim"))
        query = self.query.text.strip()
        stale = query and not self.tab.source.local and self.tab.searched != query
        badge = " ⏎ search " if stale else ""
        self.query.draw(win, 1, 3, w - 5 - dwidth(badge), curses.A_BOLD if self.typing else attr("dim"), self.typing)
        if badge: put(win, 1, w - dwidth(badge) - 1, badge, attr("ink", "accent", bold=True))
        put(win, 2, 0, "─" * w, attr("dim"))

        tab = self.tab
        if tab.hits: self.draw_hits(win, tab, h, w)
        else:
            if tab.job: text, style = f"{self.app.spinner()} searching {tab.source.label}…", attr("dim")
            elif tab.error: text, style = tab.error, attr("error")
            elif tab.searched: text, style = f"nothing found in {tab.source.label}" + \
                ("" if tab.source.local else "; try other words, or add a year"), attr("dim")
            elif tab.source.local: text, style = f"type to search {tab.source.label}", attr("dim")
            elif query: text, style = f"⏎ to search {tab.source.label} for “{query}”", attr("dim")
            else: text, style = f"type what to search {tab.source.label} for, then ⏎", attr("dim")
            for i, line in enumerate(textwrap.wrap(text, max(10, w - 4))[:max(1, h - 4)]):
                put(win, 3 + i, 2, line, style)
        if self.opening:
            source = self.opening[1].source
            self.app.footer(win, h - 1, [], f"{self.app.spinner()} filling it in from {source.label}"
                            f"{' (& its series from Wikidata)' if source.name == 'openlibrary' else ''}…  esc cancels",
                            style="accent")
        else: self.app.footer(win, h - 1, self.hints())

    def draw_hits(self, win, tab: Tab, h: int, w: int):
        rows = max(1, h - 4)
        tab.top = max(min(tab.top, tab.sel), tab.sel - rows + 1, 0)
        detail_width = max(0, min(28, w // 4))
        year_x = w - detail_width - 7
        who_cols = who_width(year_x - 4)
        who_x = year_x - who_cols - 2
        title_width = max(1, who_x - 4)
        for i, hit in enumerate(tab.hits[tab.top:tab.top + rows]):
            y, chosen = 3 + i, tab.top + i == tab.sel
            bg = "bar" if chosen else "bg"
            if chosen: put(win, y, 0, " " * w, attr(bg=bg))
            put(win, y, 0, "▸" if chosen else " ", attr("accent", bg, bold=True))
            there = self.existing(tab, hit)
            opening = self.opening and self.opening[1] is tab and chosen
            title = ("✓ " if there else "") + hit.title
            put(win, y, 2, fit(title, title_width), attr("dim" if there else "fg", bg, bold=chosen and not there))
            put(win, y, who_x, fit(hit.creator, who_cols), attr("dim", bg))
            put(win, y, year_x, hit.year[:4], attr("dim", bg))
            detail = f"{self.app.spinner()} filling in…" if opening else "in the vault" if there else hit.detail
            colour = "accent" if opening else "green" if there else "dim"
            runs(win, y, year_x + 6, [(fit(detail, detail_width), attr(colour, bg, bold=bool(opening)))],
                 detail_width)

    def hints(self) -> list[str]:
        if self.typing:
            return ["⏎ search / open top hit · ↓ list · ⇥ collection · ^U finder · esc back",
                    "⏎ search · ↓ list · esc"]
        return ["⏎ open in the editor · ←→ collection · space search · ^U finder · ? help · q back",
                "⏎ open · ? help"]
