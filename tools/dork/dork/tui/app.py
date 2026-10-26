"""dork's terminal UI: a stack of screens (the finder, the editor, & overlays over them), with the vault's
entries, the changes made this session (to undo), & the footer's messages."""

import curses
import locale
import os
import shlex
import subprocess
import time
from pathlib import Path

from ..actions import Outcome
from ..schema import CONTENT
from ..vault import load_entries, template_order, tracked
from .base import Toast, attr, dwidth, fit, init_colours, put


class App:
    def __init__(self, scr, schema: dict, content: Path = CONTENT):
        self.scr, self.schema, self.content = scr, schema, content
        self.names = tracked(schema)
        self.orders = {name: template_order(schema, name, content) for name in self.names}
        self.stack: list = []
        self.undos: list[Outcome] = []
        self.toast: Toast | None = None
        self.result: str | None = None # what to print once the UI closes
        self.running = True
        self.version = 0                # bumped whenever entries are reloaded
        self.load()

    def load(self):
        self.entries = load_entries(self.schema, self.names, self.content)
        self.mtimes = {entry.path: entry.path.stat().st_mtime for entry in self.entries}
        self.version += 1

    #---- screens -----------------------------------------------------------------------------

    def push(self, screen):
        screen.app = self
        self.stack.append(screen)
        if hasattr(screen, "opened"): screen.opened()

    def pop(self, screen):
        if screen in self.stack: self.stack.remove(screen)
        if not self.stack: self.running = False

    #---- messages & changes ------------------------------------------------------------------

    def notify(self, text: str, ok: bool = True, seconds: float = 4):
        self.toast = Toast(text, attr("green" if ok else "error"), time.monotonic() + seconds)

    def record(self, outcome: Outcome):
        """Report what an action did, & keep its changes, to undo them."""
        self.notify(outcome.message, ok=not outcome.failed, seconds=6)
        if outcome.changes and outcome.changes.before:
            self.undos.append(outcome)
            self.load()

    def undo(self):
        if not self.undos: return self.notify("nothing to undo", ok=False)
        outcome = self.undos.pop()
        outcome.changes.undo()
        self.load()
        self.notify(f"undone: {outcome.message}")

    def edit_body(self, path: Path):
        """Hand the terminal to $EDITOR, at the first line after the note's frontmatter, then take it back."""
        editor = os.environ.get("VISUAL") or os.environ.get("EDITOR") or "vi"
        text = path.read_text(encoding="utf-8")
        line = text.count("\n", 0, text.index("\n---", 3) + 4) + 2 if text.startswith("---") else 1
        before = text
        curses.def_prog_mode()
        curses.endwin()
        try: subprocess.call([*shlex.split(editor), f"+{line}", str(path)])
        except OSError as exc: self.notify(f"{editor}: {exc.strerror or exc}", ok=False)
        finally:
            curses.reset_prog_mode()
            curses.flushinp()
            self.scr.clear()
        if path.read_text(encoding="utf-8") != before:
            self.notify(f"{path.parent.name}/{path.name}: edited in {Path(shlex.split(editor)[0]).name}")
            # undoing changes made to the note before would now discard what was written in $EDITOR too
            self.undos = [outcome for outcome in self.undos if path not in outcome.changes.before]
        self.load()

    def footer(self, win, y: int, hints: list[str], note: str | None = None):
        """Toast, else note (eg. what's wrong with a field), else the widest hints that fit."""
        w = win.getmaxyx()[1]
        if self.toast and self.toast.live: put(win, y, 1, fit(self.toast.text, w - 2), self.toast.style)
        elif note: put(win, y, 1, fit(note, w - 2), attr("error"))
        else:
            text = next((h for h in hints if dwidth(h) <= w - 2), hints[-1])
            put(win, y, 1, fit(text, w - 2), attr("dim"))

    #---- running -----------------------------------------------------------------------------

    def draw(self):
        self.scr.erase()
        h, w = self.scr.getmaxyx()
        if h < 8 or w < 40: put(self.scr, 0, 0, "terminal too small")
        else:
            base = max(i for i, screen in enumerate(self.stack) if not getattr(screen, "overlay", False))
            for screen in self.stack[base:]: screen.draw(self.scr)
        self.scr.noutrefresh()
        curses.doupdate()

    def read(self):
        try: ch = self.scr.get_wch()
        except curses.error: return None
        return (ord(ch) if isinstance(ch, str) else ch), ch

    def run(self):
        while self.running and self.stack:
            self.draw()
            live = self.toast and self.toast.live
            self.scr.timeout(250 if live else -1) # repaint when a toast runs out
            got = self.read()
            self.scr.timeout(0)
            while got and self.running and self.stack: # every key already waiting, then one repaint
                key, ch = got
                if key == 3: self.running = False # ^C (raw mode passes it through)
                elif key == curses.KEY_RESIZE: self.scr.redrawwin()
                else: self.stack[-1].handle(key, ch)
                got = self.read()


def start(schema: dict, first, then=None) -> str | None:
    """Run the UI with first screen (& then, if given, over it), returning what it leaves to print."""
    locale.setlocale(locale.LC_ALL, "")
    os.environ.setdefault("ESCDELAY", "25")

    def run(scr) -> str | None:
        curses.raw() # so ^S, ^Z & ^C reach dork, rather than the terminal
        init_colours()
        try: curses.curs_set(0)
        except curses.error: pass
        app = App(scr, schema)
        app.push(first)
        if then: app.push(then)
        app.run()
        return app.result

    return curses.wrapper(run)
