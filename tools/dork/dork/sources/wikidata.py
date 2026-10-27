"""Films, series & anime, games, & board games, from Wikidata (no key; its data is public domain, CC0): one SPARQL
query per search (or per lookup of an entry by its id elsewhere), which searches Wikidata as its own search box does,
keeps the hits that are films or series (or games, or board games), & gives everything about each (year, director
or creators, developers or designers, how many can play, & TMDB's, IGDB's or BoardGameGeek's id, to link out) in
one go. Also the series a novel is in, & its number there, for Open Library's novels (by their Open Library id).

Wikidata has no posters or covers (they're copyrighted), so these entries come without."""

import re
from urllib.parse import urlencode

from ..net import fetch_json
from ..slugs import short
from . import Candidate, Source, keep, split_year, year_of

ENDPOINT = "https://query.wikidata.org/sparql"
FILM_KINDS = {"title": "text", "aliases": "list", "kind": "text", "year": "year", "director": "text", "tmdb": "tmdb"}
GAME_KINDS = {"title": "text", "aliases": "list", "year": "year", "developer": "text", "igdb": "igdb"}
BOARD_KINDS = {"title": "text", "aliases": "list", "year": "year", "designer": "text", "players": "text",
               "bgg": "digits"}

# the search, as Wikidata's search box does it, in English; its hits ranked as there
SEARCH = """
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "EntitySearch";
                    mwapi:search "%s"; mwapi:language "en"; mwapi:limit "25" .
    ?item wikibase:apiOutputItem mwapi:item . ?rank wikibase:apiOrdinal true .
  }"""

# films (Q11424) & television series (Q5398426), of any subclass; anime (Q1107) by class or genre
FILMS = """
SELECT ?item (MIN(?rank) AS ?order) (SAMPLE(?label) AS ?title) (SAMPLE(?about) AS ?description)
       (MIN(?date) AS ?released) (MIN(?start) AS ?began) (GROUP_CONCAT(DISTINCT ?makerName; separator="|") AS ?makers)
       (SAMPLE(?movie) AS ?tmdbMovie) (SAMPLE(?tv) AS ?tmdbTv) (SAMPLE(?isSeries) AS ?series)
       (SAMPLE(?isAnime) AS ?anime)
WHERE {%s
  { ?item wdt:P31/wdt:P279* wd:Q11424 } UNION { ?item wdt:P31/wdt:P279* wd:Q5398426 }
  BIND(EXISTS { ?item wdt:P31/wdt:P279* wd:Q5398426 } AS ?isSeries)
  BIND(EXISTS { { ?item wdt:P31/wdt:P279* wd:Q1107 } UNION { ?item wdt:P136 wd:Q1107 } } AS ?isAnime)
  OPTIONAL { ?item wdt:P577 ?date }
  OPTIONAL { ?item wdt:P580 ?start }
  OPTIONAL { { ?item wdt:P57 ?maker } UNION { ?item wdt:P170 ?maker } }
  OPTIONAL { ?item wdt:P4947 ?movie }
  OPTIONAL { ?item wdt:P4983 ?tv }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" .
                           ?item rdfs:label ?label; schema:description ?about . ?maker rdfs:label ?makerName . }
}
GROUP BY ?item ORDER BY ?order"""

# video games (Q7889), of any subclass
GAMES = """
SELECT ?item (MIN(?rank) AS ?order) (SAMPLE(?label) AS ?title) (SAMPLE(?about) AS ?description)
       (MIN(?date) AS ?released) (GROUP_CONCAT(DISTINCT ?makerName; separator="|") AS ?makers) (SAMPLE(?slug) AS ?igdb)
WHERE {%s
  ?item wdt:P31/wdt:P279* wd:Q7889 .
  OPTIONAL { ?item wdt:P577 ?date }
  OPTIONAL { ?item wdt:P178 ?maker }
  OPTIONAL { ?item wdt:P5794 ?slug }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" .
                           ?item rdfs:label ?label; schema:description ?about . ?maker rdfs:label ?makerName . }
}
GROUP BY ?item ORDER BY ?order"""

# board games: as Wikidata's search box finds them, & then (for names too common to find so, eg. "Root") by full
# text, among items with a BoardGameGeek id (P2339), ranked after
BOARD_SEARCH = """
  { SERVICE wikibase:mwapi {
      bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "EntitySearch";
                      mwapi:search "%(q)s"; mwapi:language "en"; mwapi:limit "25" .
      ?item wikibase:apiOutputItem mwapi:item . ?rank wikibase:apiOrdinal true . } }
  UNION
  { SERVICE wikibase:mwapi {
      bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "Search";
                      mwapi:srsearch "%(q)s haswbstatement:P2339"; mwapi:srlimit "10" .
      ?found wikibase:apiOutput mwapi:title . ?ordinal wikibase:apiOrdinal true . }
    BIND(IRI(CONCAT(STR(wd:), ?found)) AS ?item) BIND(?ordinal + 100 AS ?rank) }"""

# what has a BoardGameGeek id, or is a board game (Q131436) of any subclass (Wikidata files many under card,
# party, strategy or tabletop games instead); designers are named by any of game designer, designer, creator, author
# or developer, & names fall back to other languages (some games have no English label)
BOARD_GAMES = """
SELECT ?item (MIN(?rank) AS ?order) (SAMPLE(?label) AS ?title) (SAMPLE(?about) AS ?description)
       (MIN(?date) AS ?released) (GROUP_CONCAT(DISTINCT ?makerName; separator="|") AS ?makers)
       (MIN(?low) AS ?fewest) (MAX(?high) AS ?most) (SAMPLE(?id) AS ?bgg)
WHERE {%s
  { ?item wdt:P2339 [] } UNION { ?item wdt:P31/wdt:P279* wd:Q131436 }
  OPTIONAL { ?item wdt:P577 ?date }
  OPTIONAL { { ?item wdt:P12969 ?maker } UNION { ?item wdt:P287 ?maker } UNION { ?item wdt:P170 ?maker }
             UNION { ?item wdt:P50 ?maker } UNION { ?item wdt:P178 ?maker } }
  OPTIONAL { ?item wdt:P1872 ?low } OPTIONAL { ?item wdt:P1873 ?high }
  OPTIONAL { ?item wdt:P2339 ?id }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul,en-gb,de,fr,es,it,nl" .
                           ?item rdfs:label ?label; schema:description ?about . ?maker rdfs:label ?makerName . }
}
GROUP BY ?item ORDER BY ?order"""

# the series (P179) a work is in, by its Open Library id (P648), its number there (P1545), & whether the series is
# itself part of another the work is in (as the City Watch novels are of Discworld)
SERIES = """
SELECT ?seriesLabel ?number ?within WHERE {
  ?work wdt:P648 "%s" ; p:P179 ?statement .
  ?statement ps:P179 ?series . OPTIONAL { ?statement pq:P1545 ?number }
  BIND(EXISTS { ?work wdt:P179 ?other . FILTER(?other != ?series) ?series wdt:P179|wdt:P361 ?other } AS ?within)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" . }
}"""


def literal(text: str) -> str:
    """Text as the inside of a SPARQL string."""
    return " ".join(text.split()).replace("\\", "\\\\").replace('"', '\\"')


def query(sparql: str) -> list[dict[str, str]]:
    """Rows of a SPARQL query's results, as {variable: value} (unbound variables left out)."""
    data = fetch_json(f"{ENDPOINT}?{urlencode({'query': sparql})}", {"Accept": "application/sparql-results+json"})
    return [{name: cell["value"] for name, cell in row.items()} for row in data.get("results", {}).get("bindings", [])]


def _id(row: dict) -> str: return row["item"].rsplit("/", 1)[-1] # eg. "Q846209"


def _makers(row: dict) -> list[str]: return [name for name in row.get("makers", "").split("|") if name]


def _by(prop: str, value) -> str:
    """Clause finding the item whose prop (an id elsewhere, eg. TMDB's) is value, in place of a search."""
    return f'\n  ?item wdt:{prop} "{literal(str(value))}" . BIND(1 AS ?rank)'


def _ranked(hits: list[Candidate], year: int | None) -> list[Candidate]:
    """Hits, those from year (if given) first, & otherwise in Wikidata's order."""
    return sorted(hits, key=lambda hit: hit.year != str(year)) if year else hits


class WikidataFilms(Source):
    name, label, collection = "wikidata-films", "Wikidata", "films"

    def search(self, query_: str) -> list[Candidate]:
        words, year = split_year(query_)
        return _ranked([self.candidate(row) for row in query(FILMS % (SEARCH % literal(words))) if row.get("title")],
                       year)

    def lookup(self, fields: dict, slug: str) -> tuple[list[Candidate], bool]:
        kind, _, tmdb = str(fields.get("tmdb") or "").partition("/")
        if tmdb:
            clause = _by("P4947" if kind == "movie" else "P4983", tmdb)
            if hits := [self.candidate(row) for row in query(FILMS % clause) if row.get("title")]: return hits, True
        return super().lookup(fields, slug)

    def candidate(self, row: dict) -> Candidate:
        series, anime = row.get("series") == "true", row.get("anime") == "true"
        kind = "anime" if anime else "series" if series else "film"
        year = year_of(row.get("began") if series and row.get("began") else row.get("released"))
        tmdb = f"tv/{row['tmdbTv']}" if series and row.get("tmdbTv") else \
            f"movie/{row['tmdbMovie']}" if row.get("tmdbMovie") else f"tv/{row['tmdbTv']}" if row.get("tmdbTv") else None
        makers = _makers(row)
        notes: dict[str, str] = {}
        fields = keep({"title": row["title"], "aliases": [short(row["title"])], "kind": kind, "year": year,
                       "director": " & ".join(makers) or None, "tmdb": tmdb}, FILM_KINDS, notes)
        return Candidate(self.name, _id(row), row["title"], " & ".join(makers), str(year or ""),
                         row.get("description") or kind, fields, notes=notes)


class WikidataGames(Source):
    name, label, collection = "wikidata-games", "Wikidata", "games"

    def search(self, query_: str) -> list[Candidate]:
        words, year = split_year(query_)
        return _ranked([self.candidate(row) for row in query(GAMES % (SEARCH % literal(words))) if row.get("title")],
                       year)

    def lookup(self, fields: dict, slug: str) -> tuple[list[Candidate], bool]:
        if fields.get("igdb"):
            hits = [self.candidate(row) for row in query(GAMES % _by("P5794", fields["igdb"])) if row.get("title")]
            if hits: return hits, True
        return super().lookup(fields, slug)

    def candidate(self, row: dict) -> Candidate:
        year = year_of(row.get("released"))
        makers = _makers(row)
        notes: dict[str, str] = {}
        fields = keep({"title": row["title"], "aliases": [short(row["title"])], "year": year,
                       "developer": " & ".join(makers) or None, "igdb": row.get("igdb")}, GAME_KINDS, notes)
        return Candidate(self.name, _id(row), row["title"], " & ".join(makers), str(year or ""),
                         row.get("description") or "game", fields, notes=notes)


def players(fewest, most) -> str | None:
    """How many can play, from the fewest & most (as Wikidata gives them, eg. "2"): eg. "2–4", "2", or "3+"."""
    def whole(value) -> int | None:
        try: return int(float(value))
        except (TypeError, ValueError): return None
    low, high = whole(fewest), whole(most)
    if low and high: return str(low) if low == high else f"{low}–{high}"
    return f"{low}+" if low else f"up to {high}" if high else None


class WikidataBoardGames(Source):
    name, label, collection = "wikidata-boardgames", "Wikidata", "boardgames"

    def search(self, query_: str) -> list[Candidate]:
        words, year = split_year(query_)
        rows = query(BOARD_GAMES % (BOARD_SEARCH % {"q": literal(words)}))
        # an item with no name in any of the languages asked for is labelled by its id (eg. "Q58409118")
        named = [row for row in rows if row.get("title") and not re.fullmatch(r"Q\d+", row["title"])]
        return _ranked([self.candidate(row) for row in named], year)

    def lookup(self, fields: dict, slug: str) -> tuple[list[Candidate], bool]:
        if fields.get("bgg"):
            rows = query(BOARD_GAMES % _by("P2339", fields["bgg"]))
            if hits := [self.candidate(row) for row in rows if row.get("title")]: return hits, True
        return super().lookup(fields, slug)

    def candidate(self, row: dict) -> Candidate:
        year = year_of(row.get("released"))
        makers = _makers(row)
        notes: dict[str, str] = {}
        fields = keep({"title": row["title"], "aliases": [short(row["title"])], "year": year,
                       "designer": " & ".join(makers) or None, "players": players(row.get("fewest"), row.get("most")),
                       "bgg": int(row["bgg"]) if row.get("bgg", "").isdigit() else None}, BOARD_KINDS, notes)
        return Candidate(self.name, _id(row), row["title"], " & ".join(makers), str(year or ""),
                         row.get("description") or "board game", fields, notes=notes)


def series_of(olid: str) -> tuple[dict, dict[str, str]]:
    """Series a work is in (by its Open Library id, eg. "OL453735W") & its number there, as fields, with a note of
    any other series Wikidata has it in; the broadest series is taken (Discworld, rather than the City Watch)."""
    rows = query(SERIES % literal(olid))
    if not rows: return {}, {}
    rows.sort(key=lambda row: (row.get("within") == "true", "number" not in row)) # broadest, & numbered, first
    best, others = rows[0], rows[1:]
    number = best.get("number")
    try: number = float(number) if number else None
    except ValueError: number = None
    if number is not None and number.is_integer(): number = int(number)
    fields = {"series": best.get("seriesLabel"), "series-number": number}
    notes = {}
    if others:
        also = ", ".join(f"{row.get('seriesLabel')}" + (f" #{row['number']}" if row.get("number") else "")
                         for row in others)
        notes["series"] = f"Wikidata also has it in: {also}"
    return fields, notes
