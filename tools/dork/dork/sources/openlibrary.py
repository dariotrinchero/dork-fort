"""Novels, from Open Library (no key): a search for works, then, for the one picked, its editions, to fill in an
ISBN & page count from a likely one (English, in print, with a page count near the usual), noted as a guess (the
editor can pick another, of those fetched), & at the same time its series & number in it, from Wikidata. Searching
by ISBN pins that edition instead."""

import re
from urllib.parse import quote, urlencode

from concurrent.futures import ThreadPoolExecutor

from ..net import NetError, fetch_json
from ..slugs import short
from . import Candidate, Source, keep, title_case, valid, year_of
from .wikidata import series_of

API = "https://openlibrary.org"
COVERS = "https://covers.openlibrary.org/b/id/{}-L.jpg"
FIELDS = "key,title,subtitle,author_name,first_publish_year,number_of_pages_median,cover_i,edition_count"
KINDS = {"title": "text", "aliases": "list", "author": "text", "series": "text", "series-number": "series-number",
         "year": "year", "isbn": "isbn", "pages": "count"}

# formats of editions that aren't print (audio & e-books), or are odd (large print)
NOT_PRINT = re.compile(r"audio|e-?book|kindle|digital|electronic|large|cd|mp3", re.I)


def isbn_in(query: str) -> str | None:
    """ISBN query is (hyphens & spaces aside), if it is one."""
    digits = re.sub(r"[\s-]", "", query).upper()
    return digits if valid("isbn", digits) else None


def isbn_of(edition: dict) -> str | None:
    """Edition's first valid ISBN-13, else its first valid ISBN-10."""
    return next((i for i in [*edition.get("isbn_13", []), *edition.get("isbn_10", [])] if valid("isbn", i)), None)


def pages_of(edition: dict) -> int | None:
    """Edition's page count: as counted, else as its pagination gives it (eg. "912", or "xii, 340 p.")."""
    if edition.get("number_of_pages"): return edition["number_of_pages"]
    match = re.fullmatch(r"(?:[ivxlc]+,\s*)?(\d+)\s*(?:p\.?|pages)?", edition.get("pagination", "").strip(), re.I)
    return int(match[1]) if match else None


def likely(edition: dict) -> bool:
    """Whether edition could be the one read: with a valid ISBN-13, in print, & not in another language than
    English."""
    languages = [lang.get("key", "")[-3:] for lang in edition.get("languages", [])]
    return any(valid("isbn", i) for i in edition.get("isbn_13", [])) and (not languages or "eng" in languages) \
        and not NOT_PRINT.search(edition.get("physical_format", ""))


def score(edition: dict, pages: int | None = None) -> tuple:
    """Key ranking likely editions: those with a page count, near pages (the usual, if known), & English named,
    first; then the earliest."""
    count = edition.get("number_of_pages")
    near = bool(count and pages and abs(count - pages) <= 0.05 * pages)
    named = any(lang.get("key", "").endswith("eng") for lang in edition.get("languages", []))
    return -(2 * bool(count) + 2 * near + named), year_of(_year(edition)) or 9999


def choose(editions: list[dict], pages: int | None = None) -> dict | None:
    """Likeliest edition to be the one read (see likely & score), if any is likely."""
    candidates = [e for e in editions if likely(e)]
    return min(candidates, key=lambda e: score(e, pages)) if candidates else None


def summaries(editions: list[dict], pages: int | None = None) -> list[dict]:
    """Every edition with a valid ISBN, as the editor lists them to pick from: the likely first (best first), then
    the rest (earliest first)."""
    ranked = sorted(editions, key=lambda e: (not likely(e), score(e, pages) if likely(e) else (0, year_of(_year(e)) or 9999)))
    return [{"isbn": isbn, "pages": pages_of(e), "format": e.get("physical_format", ""),
             "year": _year(e), "publisher": (e.get("publishers") or [""])[0],
             "languages": [lang.get("key", "")[-3:] for lang in e.get("languages", [])],
             "cover": COVERS.format(e["covers"][0]) if (e.get("covers") or [0])[0] > 0 else None,
             "likely": likely(e)}
            for e in ranked if (isbn := isbn_of(e))]


def _year(edition: dict) -> str:
    """Year an edition was published, from its date as given (eg. "Sep 15, 2020")."""
    match = re.search(r"\b(1[5-9]\d\d|20\d\d)\b", edition.get("publish_date", ""))
    return match[1] if match else ""


class OpenLibrary(Source):
    name, label, collection = "openlibrary", "Open Library", "novels"

    def search(self, query: str) -> list[Candidate]:
        isbn = isbn_in(query)
        params = {"q": f"isbn:{isbn}" if isbn else query, "fields": FIELDS, "limit": 12}
        docs = fetch_json(f"{API}/search.json?{urlencode(params)}").get("docs", [])
        return [self.candidate(doc, isbn) for doc in docs if doc.get("title")]

    def lookup(self, fields: dict, slug: str) -> tuple[list[Candidate], bool]:
        isbn = isbn_in(str(fields.get("isbn") or ""))
        if isbn and (hits := self.search(isbn)): return hits[:1], True
        return self.search(" ".join(str(fields.get(key) or "") for key in ("title", "author")).strip()), False

    def candidate(self, doc: dict, isbn: str | None) -> Candidate:
        authors = doc.get("author_name") or []
        year = doc.get("first_publish_year")
        editions = doc.get("edition_count") or 0
        title = title_case(doc["title"]) # as some are in sentence case
        fields = {"title": title, "aliases": [short(title)], "author": authors[0] if authors else None, "year": year}
        return Candidate(
            self.name, doc["key"], title, authors[0] if authors else "", str(year or ""),
            f"{editions} edition{'s' * (editions != 1)}" if editions else "",
            fields, {"cover": COVERS.format(doc["cover_i"])} if doc.get("cover_i") else {}, complete=False,
            extra={"pages": doc.get("number_of_pages_median"), "isbn": isbn})

    def fill(self, candidate: Candidate) -> Candidate:
        if candidate.complete: return candidate
        with ThreadPoolExecutor(2) as pool: # its editions, & its series (from Wikidata), at once
            asked_editions = pool.submit(fetch_json, f"{API}{quote(candidate.id)}/editions.json?limit=100")
            asked_series = pool.submit(series_of, candidate.id.rsplit("/", 1)[-1])
        editions = asked_editions.result().get("entries", [])
        try: series, series_notes = asked_series.result()
        except NetError as exc: series, series_notes = {}, {"series": f"couldn't look up its series ({exc})"}

        pinned = candidate.extra.get("isbn")
        covers = candidate.covers
        if pinned:
            edition = next((e for e in editions if pinned in [*e.get("isbn_13", []), *e.get("isbn_10", [])]), None)
            if not edition: # not among the first hundred (as for a classic): asked for by itself
                try: edition = fetch_json(f"{API}/isbn/{pinned}.json")
                except NetError: edition = None
            if (edition or {}).get("covers") and edition["covers"][0] > 0: # the cover of the edition read
                covers = {"cover": COVERS.format(edition["covers"][0])}
        else: edition = choose(editions, candidate.extra.get("pages"))

        fields, notes = {**candidate.fields, **series}, {**candidate.notes, **series_notes}
        usual = candidate.extra.get("pages")
        fields["pages"] = pages_of(edition or {}) or usual
        if edition:
            fields["isbn"] = pinned or isbn_of(edition)
            if not pinned:
                notes["isbn"] = f"a guess at the edition ({describe(edition)}): p picks another"
        if fields["pages"] and not pages_of(edition or {}):
            notes["pages"] = "the usual page count of its editions: check it"
        elif edition and not pinned: notes["pages"] = notes["isbn"]
        fields = keep(fields, KINDS, notes)
        extra = {**candidate.extra, "editions": summaries(editions, usual)}
        return Candidate(**{**candidate.__dict__, "fields": fields, "notes": notes, "covers": covers, "extra": extra,
                            "complete": True})


def describe(edition: dict) -> str:
    """Edition, briefly, eg. "Hardcover, 2020, Bloomsbury"."""
    return ", ".join(filter(None, [edition.get("physical_format"), _year(edition),
                                   (edition.get("publishers") or [""])[0]])) or "no details"
