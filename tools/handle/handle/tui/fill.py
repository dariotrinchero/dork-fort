"""Filling in an entry's gaps from its collection's source, over the editor: the entry is looked up (by an id it has,
eg. its ISBN, else by its title, picking the hit that is it), the hit filled in, & handed to the editor, which fills
in the fields left empty (& notes where the source disagrees with the rest), to check & write as any other change.

It's for an entry at a time, as gaps are noticed; nothing is written until the editor writes it."""

import curses

from ..net import NetError
from ..sources import Candidate, sources
from .base import ENTER, ESC, Overlay, attr, box, dwidth, fit


class Fill(Overlay):
    def __init__(self, editor, alone: bool = False):
        self.editor = editor
        self.alone = alone            # whether the editor was opened just for this (so it goes too, if nothing comes)
        self.job = None               # the lookup, or the hit being filled in
        self.hits: list[Candidate] = []
        self.filling = False          # whether the job is filling in the hit (else, looking it up)
        self.sel = self.top = 0

    def opened(self):
        entry = self.editor.entry
        self.source = sources().get(entry.collection)
        self.title = str(self.editor.fields.get("title") or self.editor.slug)
        if not self.source: return self.give_up(f"nothing to fill {entry.collection} in from")
        if problem := self.source.problem(): return self.give_up(f"{self.source.label} {problem}")
        self.job = self.app.pool.submit(self.source.lookup, dict(self.editor.fields), self.editor.slug)

    @property
    def busy(self) -> bool: return self.job is not None

    @property
    def picking(self) -> bool: return bool(self.hits) and not self.job

    def give_up(self, message: str, ok: bool = False):
        self.job = None # left to finish, unheard
        self.close()
        if self.alone: self.app.pop(self.editor)
        self.app.notify(message, ok=ok)

    def poll(self):
        if not self.job or not self.job.done(): return
        job, self.job = self.job, None
        try: result = job.result()
        except NetError as exc: return self.give_up(f"couldn't look it up: {exc}")
        except Exception as exc: return self.give_up(f"{self.source.label}: {type(exc).__name__}: {exc}")
        if isinstance(result, Candidate): return self.done(result)
        hits, exact = result
        if not hits: return self.give_up(f"nothing found in {self.source.label} for “{self.title}”")
        if exact: return self.pick(hits[0])
        self.hits = hits

    def pick(self, hit: Candidate):
        if hit.complete: return self.done(hit)
        self.job, self.filling = self.app.pool.submit(self.source.fill, hit), True

    def done(self, hit: Candidate):
        self.close()
        self.editor.take(hit, self.source.label)

    def handle(self, key: int, ch):
        if not self.picking:
            if key in (ESC, ord("q")): self.give_up("cancelled", ok=True)
            return
        if key in (curses.KEY_DOWN, ord("j")): self.sel = min(len(self.hits) - 1, self.sel + 1)
        elif key in (curses.KEY_UP, ord("k")): self.sel = max(0, self.sel - 1)
        elif key in ENTER: self.pick(self.hits[self.sel])
        elif key in (ESC, ord("q")): self.give_up("cancelled", ok=True)

    @staticmethod
    def line(hit: Candidate) -> str:
        return " · ".join(part for part in (hit.title, hit.creator, hit.year, hit.detail) if part)

    def draw(self, win):
        h, w = win.getmaxyx()
        spin = self.app.spinner()
        if not self.picking:
            doing = f"filling it in from {self.source.label}" + \
                (" (& its series from Wikidata)" if self.source.name == "openlibrary" else "") if self.filling else \
                f"looking it up in {self.source.label}"
            body = [[(self.title, curses.A_BOLD)], [], [(f"{spin} {doing}…", attr("accent"))], [],
                    [("esc cancel", attr("dim"))]]
            return box(win, "Fill in", body, max(dwidth(self.title), dwidth(doing) + 4) + 6)

        width = min(w - 2, max(60, max(dwidth(self.line(hit)) for hit in self.hits) + 6))
        rows = max(3, min(len(self.hits), h - 8))
        self.top = max(min(self.top, self.sel), self.sel - rows + 1, 0)
        body = [[(f"Which is “{self.title}”? (by its title, in {self.source.label})", attr("dim"))], []]
        for i, hit in enumerate(self.hits[self.top:self.top + rows]):
            chosen = self.top + i == self.sel
            body.append([("▸ " if chosen else "  ", attr("accent", bold=True)),
                         (fit(self.line(hit), width - 6), attr("ink", "accent") if chosen else 0)])
        body += [[], [("↑↓ choose · ⏎ fill in from it · esc cancel", attr("dim"))]]
        box(win, "Fill in", body, width)
