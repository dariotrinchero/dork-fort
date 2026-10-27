"""Where new entries come from: a source per collection, each searching for candidates (hits), & filling in the
one picked. Searching costs one request (or none, for Zotero, read from disk); filling in costs at most one more,
& only for the candidate picked. Every request goes through net.py, which keeps it polite. Sources also look up
entries already in the vault (by an id they have, else by title), to fill in their gaps.

A source maps what it's given to fields of the collection's template, keeping only values that validate (a
value that doesn't is left out, & noted, rather than filled in as junk)."""

import re
from dataclasses import dataclass, field
from datetime import date

from ..actions import fold
from ..validate import check_value, is_empty


@dataclass
class Candidate:
    """A hit: what to show of it in the list, & the fields it fills (once filled in, if it needs to be)."""
    source: str                 # name of source, eg. "openlibrary"
    id: str                     # its id there, eg. "/works/OL20893680W"
    title: str
    creator: str = ""           # who made it, as shown
    year: str = ""
    detail: str = ""            # anything more to tell it apart, eg. "23 editions"
    fields: dict = field(default_factory=dict)
    covers: dict[str, str] = field(default_factory=dict)  # attachment fields' remote images, eg. {"cover": url}
    notes: dict[str, str] = field(default_factory=dict)   # warnings about fields, eg. {"isbn": "guessed edition"}
    complete: bool = True       # whether fields are all there, or it needs filling in first
    extra: dict = field(default_factory=dict)             # what the source keeps for filling it in


class Source:
    """A source of new entries for a collection."""
    name = ""
    label = ""                  # as named to the user, eg. "Open Library"
    collection = ""
    local = False               # searched on disk (as you type), rather than over the network (on Enter)

    def problem(self) -> str | None:
        """Why it can't be used (eg. no API key configured), or None if it can."""
        return None

    def search(self, query: str) -> list[Candidate]:
        raise NotImplementedError

    def fill(self, candidate: Candidate) -> Candidate:
        """Candidate with all its fields (fetching what more it needs)."""
        return candidate

    def lookup(self, fields: dict, slug: str) -> tuple[list[Candidate], bool]:
        """Hits that could be the entry with fields (named slug), to fill in its gaps, & whether they were found by
        an id it has (so the first is surely it); without one, by its title (& year, which ranks the hits)."""
        return self.search(" ".join(str(fields.get(key) or "") for key in ("title", "year")).strip()), False


def valid(kind: str, value, **field_) -> bool:
    """Whether value passes as a field of kind (empty values don't count)."""
    return not is_empty(value) and check_value({"type": kind, **field_}, value) is None


def keep(fields: dict, kinds: dict[str, str], notes: dict[str, str]) -> dict:
    """Fields whose values validate as their kinds; others are dropped, with a note saying what was dropped."""
    kept = {}
    for key, value in fields.items():
        if is_empty(value) or key not in kinds or valid(kinds[key], value): kept[key] = value
        else: notes.setdefault(key, f"left out {value!r}, which doesn't pass")
    return kept


def year_of(text) -> int | None:
    """Year a date starts with (eg. 2020 of "2020-09-15"), if any (& not 0)."""
    match = re.match(r"\s*(-?\d{4})", str(text or ""))
    return int(match[1]) if match and int(match[1]) else None


def split_year(query: str) -> tuple[str, int | None]:
    """Query without a year at its end, & that year (eg. "after hours", 1985 of "after hours 1985")."""
    match = re.fullmatch(r"(.*\S)\s+((?:1[89]|20)\d\d)", query.strip())
    return (match[1], int(match[2])) if match else (query.strip(), None)


# words left lowercase in titles, unless they start (or end) the title, or follow a colon
SMALL_WORDS = {"a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "as", "at", "by", "in", "of", "off",
               "on", "per", "to", "up", "via", "vs", "with", "from", "into", "onto", "than"}


def title_case(text: str) -> str:
    """Title in title case ("Naming and Necessity" of Zotero's "Naming and necessity"), capitalising each word but
    small ones mid-title; capitals already there (eg. of names) stay."""
    words = re.split(r"(\s+)", text)
    out, start = [], True
    for i, word in enumerate(words):
        if not word or word.isspace():
            out.append(word)
            continue
        last = all(not w or w.isspace() for w in words[i + 1:])
        if not start and not last and word.lower().strip("\"'(“‘") in SMALL_WORDS: out.append(word.lower())
        else: out.append(re.sub(r"^([\"'(“‘]?)(\w)", lambda m: m[1] + m[2].upper(), word))
        start = word.endswith((":", "?", "!", "—", "."))
    return "".join(out)


def suspicious(fields: dict) -> dict[str, str]:
    """Values that pass validation, but look like junk (as APIs sometimes give): warnings, by field."""
    found = {}
    year = fields.get("year")
    if isinstance(year, int) and year > date.today().year: found["year"] = "is in the future"
    title = fields.get("title")
    if isinstance(title, str) and len(title) > 3 and title.isupper(): found["title"] = "is in capitals"
    for key in ("author", "director", "developer", "designer"):
        if str(fields.get(key) or "").strip().lower() in ("unknown", "anonymous", "various", "n/a"):
            found[key] = "looks like a placeholder"
    pages = fields.get("pages")
    if isinstance(pages, int) and not 10 <= pages <= 5000: found["pages"] = "looks wrong"
    # before it came out: early access, or a preview, maybe, but maybe a mistake
    for key in ("started", "finished", "first-played"):
        when = year_of(fields.get(key))
        if isinstance(year, int) and when and when < year:
            found[key] = f"is before {year}, its year: early access, or a preview? (else one of them is wrong)"
    return found


# fields a source gives that are the entry's own, & never filled in from it (its title, as you have it); & those
# it may fill in, but whose values differ by choice, not by mistake (a kind of "textbook" is yours, say)
OWN, CHOSEN = ("title", "aliases"), ("kind",)


def agrees(mine, theirs) -> bool:
    """Whether values are the same, but for case & accents (so "Le Guin" is "le guin"), & 4 is 4.0."""
    if isinstance(mine, list) and isinstance(theirs, list):
        return len(mine) == len(theirs) and all(map(agrees, mine, theirs))
    if isinstance(mine, str) or isinstance(theirs, str): return fold(str(mine)).casefold() == fold(str(theirs)).casefold()
    return mine == theirs


def proposals(fields: dict, candidate: Candidate, label: str) -> tuple[dict, dict[str, str]]:
    """What candidate (fetched for an entry with fields, from label) fills in: values for the fields left empty, &
    notes on them (the source's), & on those filled in that it disagrees with, which are left as they are."""
    proposed, notes = {}, {}
    for key in fields:
        if key in OWN: continue
        value, mine = candidate.fields.get(key), fields[key]
        if is_empty(mine):
            if not is_empty(value): proposed[key] = value
            if key in candidate.notes: notes[key] = candidate.notes[key] # eg. a guessed edition, or a value left out
        elif not is_empty(value) and key not in CHOSEN and not agrees(mine, value):
            shown = ", ".join(map(str, value)) if isinstance(value, list) else value
            notes[key] = f"{label} has {shown}; left as it is (x, then f, to take that)"
    return proposed, notes


def sources() -> dict[str, Source]:
    """Source of each collection."""
    from .openlibrary import OpenLibrary
    from .wikidata import WikidataBoardGames, WikidataFilms, WikidataGames
    from .zotero import Zotero
    return {source.collection: source for source in (OpenLibrary(), Zotero(), WikidataFilms(), WikidataGames(),
                                                           WikidataBoardGames())}
