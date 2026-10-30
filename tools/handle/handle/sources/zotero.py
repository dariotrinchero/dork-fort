"""Nonfiction, from Zotero's own database (no network): every item with a citation key, searched as you type. The
filename is the citation key (as Better BibTeX keeps it, in Zotero's citationKey field), the metadata is the item's
edition (its title in title case, as Zotero keeps sentence case), & its kind follows its item type (books are
"book", most else "paper"; "textbook" is yours to choose).

handle never changes Zotero's data. It opens zotero.sqlite read-only & immutable (so SQLite refuses to write, &
makes no lock, journal or WAL files), & touches nothing else of Zotero's. While Zotero runs, it may be writing the
database; if that leaves a read failing, the read is retried on a temporary copy (made by reading the file)."""

import re
import shutil
import sqlite3
import tempfile
from contextlib import closing
from pathlib import Path
from urllib.parse import quote

from ..actions import fold
from ..config import setting
from ..fuzzy import fuzzy_match
from ..slugs import short
from . import Candidate, Source, keep, title_case, valid, year_of

DATA_DIRS = ["~/Zotero", "~/Documents/Zotero"]
KINDS = {"title": "text", "aliases": "list", "kind": "text", "authors": "list", "translator": "text", "year": "year",
         "isbn": "isbn", "doi": "doi", "arxiv": "arxiv", "url": "url"}

# kinds of item types (others, eg. attachments, notes, & videos, aren't nonfiction to read)
TYPES = {"book": "book", "bookSection": "paper", "journalArticle": "paper", "preprint": "paper", "manuscript": "paper",
         "conferencePaper": "paper", "thesis": "paper", "report": "paper", "encyclopediaArticle": "paper",
         "magazineArticle": "paper", "document": "paper"}
FIELDS = ("title", "shortTitle", "date", "ISBN", "DOI", "url", "archiveID", "extra", "citationKey")


def database() -> Path | None:
    """Zotero's database: in the data directory configured, or else the first of the usual ones that has it."""
    dirs = [setting("zotero", "data-dir")] if setting("zotero", "data-dir") else DATA_DIRS
    return next((p for d in dirs if (p := Path(d).expanduser() / "zotero.sqlite").exists()), None)


def connect(path: Path) -> sqlite3.Connection:
    """Read-only, immutable connection to database (the only way handle opens Zotero's)."""
    return sqlite3.connect(f"file:{quote(str(path))}?mode=ro&immutable=1", uri=True)


def read(path: Path) -> list[dict]:
    """Items of database with citation keys: their type, fields (by name) & creators (by type, in order)."""
    try: return _read(path)
    except sqlite3.DatabaseError: # a page half-written by Zotero, say: read a copy instead
        with tempfile.TemporaryDirectory() as scratch:
            copy = Path(scratch) / "zotero.sqlite"
            shutil.copyfile(path, copy)
            return _read(copy)


def _read(path: Path) -> list[dict]:
    with closing(connect(path)) as con:
        items = {item: {"type": kind, "fields": {}, "creators": {}} for item, kind in con.execute(
            f"""SELECT itemID, typeName FROM items JOIN itemTypes USING (itemTypeID)
                WHERE typeName IN ({",".join("?" * len(TYPES))}) AND itemID NOT IN (SELECT itemID FROM deletedItems)""",
            list(TYPES))}
        for item, name, value in con.execute(
                f"""SELECT itemID, fieldName, value FROM itemData JOIN fieldsCombined USING (fieldID)
                    JOIN itemDataValues USING (valueID) WHERE fieldName IN ({",".join("?" * len(FIELDS))})""",
                list(FIELDS)):
            if item in items: items[item]["fields"][name] = value
        for item, role, first, last, single in con.execute(
                """SELECT itemID, creatorType, firstName, lastName, fieldMode FROM itemCreators
                   JOIN creators USING (creatorID) JOIN creatorTypes USING (creatorTypeID)
                   ORDER BY itemID, orderIndex"""):
            if item in items:
                name = last if single == 1 else f"{first or ''} {last or ''}".strip()
                items[item]["creators"].setdefault(role, []).append(name)
    return [item for item in items.values() if item["fields"].get("citationKey")]


def candidate(item: dict) -> Candidate:
    """Candidate of item, its fields complete."""
    data, creators = item["fields"], item["creators"]
    title = title_case(data.get("title") or data["citationKey"]) # Zotero keeps titles in sentence case
    authors = creators.get("author") or creators.get("editor") or []
    year = year_of(data.get("date"))
    # Zotero's ISBN field may hold several, eg. "0-674-59845-8 978-0-674-59845-4"
    isbns = [i.replace("-", "").upper() for i in re.split(r"[\s,;]+", data.get("ISBN", "")) if i]
    isbn = next((i for i in sorted(isbns, key=len, reverse=True) if valid("isbn", i)), None) # ISBN-13 first
    extra = data.get("extra", "")
    doi = data.get("DOI") or (re.search(r"^DOI:\s*(\S+)", extra, re.M | re.I) or [None, None])[1]
    arxiv = re.sub(r"^arxiv:\s*", "", data.get("archiveID", ""), flags=re.I) or \
        (re.search(r"^arXiv:\s*(\S+)", extra, re.M | re.I) or [None, None])[1]
    kind = TYPES[item["type"]]
    notes: dict[str, str] = {}
    fields = keep({"title": title, "aliases": [title_case(data.get("shortTitle") or short(title))], "kind": kind,
                   "authors": authors, "translator": " & ".join(creators.get("translator", [])) or None,
                   "year": year, "isbn": isbn, "doi": doi, "arxiv": arxiv, "url": data.get("url")}, KINDS, notes)
    shown = authors[0] + (" et al." if len(authors) > 2 else f" & {authors[1]}" if len(authors) == 2 else "") \
        if authors else ""
    return Candidate("zotero", data["citationKey"], title, shown, str(year or ""),
                     f"{kind} · {data['citationKey']}", fields, notes=notes, extra={"slug": data["citationKey"]})


class Zotero(Source):
    name, label, collection, local = "zotero", "Zotero", "nonfiction", True

    def __init__(self):
        self._items: list[Candidate] | None = None

    def problem(self) -> str | None:
        if not database():
            return "can't find zotero.sqlite: set data-dir under [zotero] in ~/.config/handle/config.toml"
        return None

    def items(self) -> list[Candidate]:
        """Every item with a citation key (read once a session)."""
        if self._items is None: self._items = [candidate(item) for item in read(database())]
        return self._items

    def search(self, query: str) -> list[Candidate]:
        if not query.strip(): return []
        # every word as typed (or its start, while typing it), not letters scattered over a library of hundreds
        query = fold(query).lower()
        scored = []
        for hit in self.items():
            text = fold(f"{hit.title}  {hit.creator}  {hit.id} {hit.year}")
            if all(word in text.lower() for word in query.split()) and (match := fuzzy_match(query, text)):
                scored.append((match[1], hit))
        scored.sort(key=lambda pair: -pair[0])
        return [hit for _, hit in scored[:40]]

    def lookup(self, fields: dict, slug: str) -> tuple[list[Candidate], bool]:
        hit = next((hit for hit in self.items() if hit.id == slug), None) # its citation key
        return ([hit], True) if hit else (self.search(str(fields.get("title") or "")), False)
