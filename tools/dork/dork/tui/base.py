"""Building blocks of dork's screens: colours, text measurement & drawing (as in cli-tools' twoey.py & wikly.py),
a line editor, & the overlays (star meter, yes-or-no question, help)."""

import curses
import time
import unicodedata
from dataclasses import dataclass
from functools import lru_cache

from ..actions import stars

#---- keys -----------------------------------------------------------------------------------------

ENTER, ESC, TAB, BACKSPACES = (10, 13), 27, 9, (curses.KEY_BACKSPACE, 127, 8)


def ctrl(letter: str) -> int: return ord(letter.upper()) - 64


#---- colours --------------------------------------------------------------------------------------

# colours by name: text, status roles (as named in the schema), & collections
PALETTE = {
    "dim": "7f848e", "accent": "e5c07b", "error": "e06c75", "ok": "98c379", "bar": "3a3f4b", "ink": "1e2127",
    "yellow": "e5c07b", "cyan": "56b6c2", "blue": "61afef", "green": "98c379", "red": "e06c75",
    "novels": "c678dd", "nonfiction": "d19a66", "films": "f08dbd", "games": "7fd1b9",
}

# the eight basic colours, for terminals with no more
_BASIC = {curses.COLOR_BLACK: (0, 0, 0), curses.COLOR_RED: (205, 0, 0), curses.COLOR_GREEN: (0, 205, 0),
          curses.COLOR_YELLOW: (205, 205, 0), curses.COLOR_BLUE: (0, 0, 238), curses.COLOR_MAGENTA: (205, 0, 205),
          curses.COLOR_CYAN: (0, 205, 205), curses.COLOR_WHITE: (229, 229, 229)}

_inks: dict[str, int] = {}
_pairs: dict[tuple[int, int], int] = {}


def _rgb(hex_: str) -> tuple[int, int, int]: return tuple(int(hex_[i:i + 2], 16) for i in (0, 2, 4))


def _nearest(rgb: tuple[int, int, int], palette: dict[int, tuple]) -> int:
    return min(palette, key=lambda i: sum((a - b) ** 2 for a, b in zip(palette[i], rgb)))


@lru_cache(maxsize=1)
def _xterm() -> dict[int, tuple]:
    levels = (0, 95, 135, 175, 215, 255)
    palette = {i: (levels[(i - 16) // 36], levels[(i - 16) // 6 % 6], levels[(i - 16) % 6]) for i in range(16, 232)}
    return palette | {i: (8 + (i - 232) * 10,) * 3 for i in range(232, 256)}


def ink(name: str) -> int:
    """Colour index for colour named in PALETTE (or a hex triple): exact where the terminal allows, else the
    nearest it has; -1 (the terminal's own) for "fg" & "bg"."""
    if name in ("fg", "bg") or not curses.has_colors(): return -1
    if name not in _inks:
        rgb = _rgb(PALETTE.get(name, name))
        if curses.can_change_color() and curses.COLORS >= 256:
            index = 64 + len(_inks)
            curses.init_color(index, *(round(v * 1000 / 255) for v in rgb))
        elif curses.COLORS >= 256: index = _nearest(rgb, _xterm())
        else: index = _nearest(rgb, _BASIC)
        _inks[name] = index
    return _inks[name]


def attr(fg: str = "fg", bg: str = "bg", bold: bool = False, underline: bool = False) -> int:
    """Attribute drawing text in colour fg (named, as for ink) on bg."""
    style = (curses.A_BOLD if bold else 0) | (curses.A_UNDERLINE if underline else 0)
    if not curses.has_colors(): return style | (curses.A_REVERSE if bg not in ("bg", None) else 0)
    key = (ink(fg), ink(bg))
    if key not in _pairs:
        _pairs[key] = len(_pairs) + 1
        curses.init_pair(_pairs[key], *key)
    return curses.color_pair(_pairs[key]) | style


def init_colours():
    if curses.has_colors():
        curses.start_color()
        curses.use_default_colors()


#---- text measurement & drawing -------------------------------------------------------------------

@lru_cache(maxsize=8192)
def dwidth(text: str) -> int:
    """Cells a string occupies, counted as wcwidth -- & so curses -- counts them."""
    if text.isascii(): return len(text)
    total = 0
    for ch in text:
        if unicodedata.category(ch) in ("Mn", "Me", "Cf"): continue
        total += 2 if unicodedata.east_asian_width(ch) in "WF" else 1
    return total


def clip(text: str, width: int) -> str:
    """Longest prefix of text that fits in width cells."""
    if dwidth(text) <= width: return text
    out, used = "", 0
    for ch in text:
        step = dwidth(ch)
        if used + step > width: break
        out, used = out + ch, used + step
    return out


def fit(text: str, width: int) -> str:
    """Pad text to width, truncating its end with an ellipsis if it won't fit."""
    if width <= 0: return ""
    if dwidth(text) > width: text = clip(text, width - 1) + "…"
    return text + " " * max(0, width - dwidth(text))


def put(win, y: int, x: int, text: str, style: int = 0, limit: int | None = None) -> int:
    """Draw text at (y, x), clipped to the window (or to limit columns) & never wrapping; returns the column
    after it."""
    h, w = win.getmaxyx()
    if not (0 <= y < h) or x < 0 or x >= w: return x
    text = clip(text, min(w - x, limit if limit is not None else w - x))
    if not text: return x
    try: win.addstr(y, x, text, style)
    except curses.error: pass # the bottom-right cell always raises; nothing to do about it
    return x + dwidth(text)


def runs(win, y: int, x: int, segments: list[tuple[str, int]], limit: int) -> int:
    """Draw runs of (text, attribute) in a row, within limit columns; returns the column after them."""
    end = x + limit
    for text, style in segments:
        if x >= end: break
        x = put(win, y, x, text, style, end - x)
    return x


def box(win, title: str, body: list[list[tuple[str, int]]], width: int, border: str = "accent") -> tuple[int, int]:
    """A rounded box centred on the window, holding rows of runs; returns its top & left."""
    h, w = win.getmaxyx()
    bw, bh = max(24, min(w - 2, width)), min(h, len(body) + 2)
    y0, x0 = max(0, (h - bh) // 2), max(0, (w - bw) // 2)
    edge = attr(border)
    put(win, y0, x0, "╭" + "─" * (bw - 2) + "╮", edge)
    put(win, y0 + bh - 1, x0, "╰" + "─" * (bw - 2) + "╯", edge)
    for i, row in enumerate(body[:bh - 2]):
        put(win, y0 + 1 + i, x0, "│" + " " * (bw - 2) + "│", edge)
        runs(win, y0 + 1 + i, x0 + 2, row, bw - 4)
    put(win, y0, x0 + 2, f" {title} ", attr("ink", border, bold=True))
    return y0, x0


#---- line editor ----------------------------------------------------------------------------------

@dataclass
class LineEdit:
    """A line of text being typed, & the cursor in it (an index into text)."""
    text: str = ""
    cursor: int | None = None

    def __post_init__(self):
        if self.cursor is None: self.cursor = len(self.text)

    def handle(self, key: int, ch) -> bool:
        """Take key, if it is one for editing a line (typing, deleting, moving); returns whether it was."""
        text, i = self.text, self.cursor
        if isinstance(ch, str) and ch.isprintable() and key >= 32:
            self.text, self.cursor = text[:i] + ch + text[i:], i + 1
        elif key in BACKSPACES:
            if i: self.text, self.cursor = text[:i - 1] + text[i:], i - 1
        elif key == curses.KEY_DC: self.text = text[:i] + text[i + 1:]
        elif key == curses.KEY_LEFT: self.cursor = max(0, i - 1)
        elif key == curses.KEY_RIGHT: self.cursor = min(len(text), i + 1)
        elif key in (curses.KEY_HOME, ctrl("a")): self.cursor = 0
        elif key in (curses.KEY_END, ctrl("e")): self.cursor = len(text)
        elif key == ctrl("u"): self.text, self.cursor = text[i:], 0
        elif key == ctrl("k"): self.text = text[:i]
        elif key == ctrl("w"):
            start = len(text[:i].rstrip())
            while start and not text[start - 1].isspace(): start -= 1
            self.text, self.cursor = text[:start] + text[i:], start
        else: return False
        return True

    def draw(self, win, y: int, x: int, width: int, style: int = 0, cursor: bool = True):
        """Draw text in width columns, scrolled to keep the cursor in view, the cursor shown as a block."""
        before, after = self.text[:self.cursor], self.text[self.cursor:]
        while dwidth(before) >= width and before: before = before[1:] # scroll: drop from the start
        x = put(win, y, x, before, style, width)
        if cursor:
            under = after[:1] or " "
            x = put(win, y, x, under, style | curses.A_REVERSE, width - dwidth(before))
            after = after[1:]
        put(win, y, x, after, style, max(0, width - dwidth(before) - (1 if cursor else 0)))


#---- overlays -------------------------------------------------------------------------------------

class Overlay:
    """A screen drawn over the one below (which still shows), taking keys until it closes."""
    overlay = True
    app = None

    def close(self): self.app.pop(self)


def meter(rating) -> str:
    """Star meter, filled in quarters (eg. "★★★★¾"), or five empty stars for no rating."""
    return "☆" * 5 if rating is None else stars(rating)


def step_rating(rating, delta: float):
    """Rating moved by delta (in quarter stars), within 1–5: below 1 is no rating, & up from none is 1. Whole
    ratings are ints, as YAML reads them back."""
    if rating is None: value = 1.0 if delta > 0 else None
    else:
        value = round(rating * 4) / 4 + delta
        value = None if value < 1 else min(5.0, value)
    return int(value) if value is not None and value.is_integer() else value


class Stars(Overlay):
    """Star meter for rating something: ↑/↓ (or ←/→) step in quarters, digits set whole stars, 0 or Backspace
    clear it; Enter commits, calling done with the rating (None for none)."""

    def __init__(self, title: str, rating, done):
        self.title, self.done = title, done
        self.rating = rating if isinstance(rating, (int, float)) and not isinstance(rating, bool) else None

    def handle(self, key: int, ch):
        if key in (curses.KEY_UP, curses.KEY_RIGHT, ord("k"), ord("l"), ord("+")):
            self.rating = step_rating(self.rating, 0.25)
        elif key in (curses.KEY_DOWN, curses.KEY_LEFT, ord("j"), ord("h"), ord("-")):
            self.rating = step_rating(self.rating, -0.25)
        elif ord("1") <= key <= ord("5"): self.rating = key - ord("0")
        elif key in (ord("0"), *BACKSPACES, curses.KEY_DC, ord("x")): self.rating = None
        elif key in ENTER:
            self.close()
            self.done(self.rating)
        elif key in (ESC, ord("q")): self.close()

    def draw(self, win):
        value = "no rating" if self.rating is None else f"{self.rating:g}"
        box(win, "Rate", [
            [(self.title, curses.A_BOLD)], [],
            [(meter(self.rating), attr("accent", bold=True)), (f"   {value}", attr("dim"))], [],
            [("↑↓ quarter stars · 1–5 whole · 0 none", attr("dim"))],
            [("⏎ save · esc cancel", attr("dim"))],
        ], max(42, dwidth(self.title) + 6))


class Confirm(Overlay):
    """A yes-or-no question; y calls yes, & anything else closes it."""

    def __init__(self, question: str, yes):
        self.question, self.yes = question, yes

    def handle(self, key: int, ch):
        self.close()
        if key in (ord("y"), ord("Y")): self.yes()

    def draw(self, win):
        box(win, "Sure?", [[(self.question, curses.A_BOLD)], [],
                           [("y yes", attr("error", bold=True)), ("   any other key: no", attr("dim"))]],
            dwidth(self.question) + 6, border="error")


class Help(Overlay):
    """Keys of a screen, as (keys, what they do); any key closes it."""

    def __init__(self, title: str, keys: list[tuple[str, str]]):
        self.title, self.keys = title, keys

    def handle(self, key: int, ch): self.close()

    def draw(self, win):
        pad = max(dwidth(k) for k, _ in self.keys)
        body = [[(k + " " * (pad - dwidth(k)), attr("accent")), (f"   {what}", 0)] for k, what in self.keys]
        box(win, self.title, body + [[], [("any key to close", attr("dim"))]],
            pad + max(dwidth(what) for _, what in self.keys) + 9)


@dataclass
class Toast:
    """A message shown in the footer for a while."""
    text: str
    style: int
    until: float

    @property
    def live(self) -> bool: return time.monotonic() < self.until
