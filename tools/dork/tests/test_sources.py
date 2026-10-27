"""Tests of where new entries come from, all offline: each source, on responses saved in fixtures/ (as they gave them), Zotero on a made-up database (& on the real one, if there is one,
only to show dork leaves it untouched), & the politeness of net.py. Wikidata's responses are real too, saved once.

Run with: python3 -m unittest discover tools/dork/tests
"""

import hashlib
import json
import os
import sqlite3
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dork import net
from dork.sources import Candidate, proposals, split_year, suspicious, title_case
from dork.sources import openlibrary, wikidata, zotero

FIXTURES = Path(__file__).parent / "fixtures"


def serve(*routes: tuple[str, str]):
    """Fake fetch_json, answering URLs containing each route's text with its fixture, & noting what it's asked."""
    asked = []

    def fetch_json(url, headers=None, data=None):
        asked.append((url, data))
        name = next(fixture for text, fixture in routes if text in url)
        return json.loads((FIXTURES / name).read_text(encoding="utf-8"))

    fetch_json.asked = asked
    return fetch_json


class Text(unittest.TestCase):
    def test_title_case(self):
        for given, wanted in [("Naming and necessity", "Naming and Necessity"),
                              ("Debating procreation: is it wrong to reproduce?",
                               "Debating Procreation: Is It Wrong to Reproduce?"),
                              ("Warranted Christian belief", "Warranted Christian Belief"),
                              ("what we are made of", "What We Are Made Of"),
                              ("the view from nowhere", "The View from Nowhere")]:
            self.assertEqual(title_case(given), wanted)

    def test_split_year(self):
        self.assertEqual(split_year("after hours 1985"), ("after hours", 1985))
        self.assertEqual(split_year("blade runner 2049"), ("blade runner", 2049)) # can't be helped; still found
        self.assertEqual(split_year("1984"), ("1984", None))
        self.assertEqual(split_year("dune"), ("dune", None))

    def test_suspicious(self):
        self.assertEqual(suspicious({"year": 2999, "title": "PIRANESI", "author": "Unknown", "pages": 0}).keys(),
                         {"year", "title", "author", "pages"})
        self.assertEqual(suspicious({"year": 2020, "title": "Piranesi", "author": "Susanna Clarke", "pages": 272}), {})
        self.assertEqual(suspicious({"year": 2017, "started": "2016-08", "finished": 2017}).keys(), {"started"})
        self.assertEqual(suspicious({"year": 2017, "started": "2017-01-02", "finished": "2018"}), {})

    def test_proposals(self):
        mine = {"title": "Guards! Guards!", "aliases": ["Guards!"], "kind": "textbook", "author": "terry pratchett",
                "series": "Discworld", "series-number": None, "year": None, "isbn": "9780060850524", "pages": None,
                "translator": None}
        theirs = Candidate("openlibrary", "/works/OL453735W", "Guards! Guards!", fields={
            "title": "Guards! Guards", "aliases": ["Guards"], "kind": "book", "author": "Terry Pratchett",
            "series": "Discworld", "series-number": 8, "year": 1989, "isbn": "9780141439518", "pages": 288},
            notes={"pages": "the usual page count of its editions: check it", "isbn": "a guess at the edition"})
        proposed, notes = proposals(mine, theirs, "Open Library")
        self.assertEqual(proposed, {"series-number": 8, "year": 1989, "pages": 288}) # only what's empty
        self.assertEqual(notes.keys(), {"pages", "isbn"})
        self.assertIn("usual page count", notes["pages"])                           # the source's note
        self.assertIn("Open Library has 9780141439518; left as it is", notes["isbn"]) # not its guess: it differs
        # title & aliases are yours; the author agrees but for case; a kind is chosen, so differing isn't noted


class OpenLibrary(unittest.TestCase):
    def setUp(self):
        self.fetch = serve(("editions", "openlibrary-piranesi-editions.json"), ("search", "openlibrary-piranesi.json"))
        self.wikidata = serve(("query.wikidata.org", "wikidata-series-piranesi.json"))
        for patch in (mock.patch.object(openlibrary, "fetch_json", self.fetch),
                      mock.patch.object(wikidata, "fetch_json", self.wikidata)):
            patch.start()
            self.addCleanup(patch.stop)
        self.source = openlibrary.OpenLibrary()

    def test_search_then_fill(self):
        hits = self.source.search("piranesi clarke")
        self.assertEqual(len(self.fetch.asked), 1)
        self.assertNotIn("isbn", self.fetch.asked[0][0].split("fields=")[1]) # every edition's ISBNs: kilobytes
        hit = hits[0]
        self.assertEqual((hit.title, hit.creator, hit.year, hit.detail), ("Piranesi", "Susanna Clarke", "2020",
                                                                          "23 editions"))
        self.assertFalse(hit.complete)
        self.assertEqual(hit.covers, {"cover": "https://covers.openlibrary.org/b/id/10226290-L.jpg"})

        filled = self.source.fill(hit)
        self.assertEqual(len(self.fetch.asked), 2)
        self.assertEqual(len(self.wikidata.asked), 1)  # its series, at the same time
        self.assertIn("OL20893680W", self.wikidata.asked[0][0])
        self.assertEqual(filled.fields, {"title": "Piranesi", "aliases": ["Piranesi"], "author": "Susanna Clarke",
                                         "year": 2020, "isbn": "9781526622426", "pages": 272})
        self.assertIn("a guess at the edition", filled.notes["isbn"])
        self.assertTrue(filled.complete)

        # every edition with a valid ISBN, to pick another from, likely ones first (the guess first of all)
        editions = filled.extra["editions"]
        self.assertEqual(editions[0]["isbn"], "9781526622426")
        likely = [e["likely"] for e in editions]
        self.assertEqual(likely, sorted(likely, reverse=True))
        self.assertIn("9788418363283", [e["isbn"] for e in editions]) # Spanish, so unlikely, but listed

    def test_isbn_pins_edition(self):
        hit = self.source.search("978-1-5266-2242-6")[0]
        self.assertIn("q=isbn%3A9781526622426", self.fetch.asked[0][0])
        filled = self.source.fill(hit)
        self.assertEqual(filled.fields["isbn"], "9781526622426")
        self.assertNotIn("isbn", filled.notes) # pinned, so not a guess

    def test_lookup(self):
        hits, exact = self.source.lookup({"title": "Piranesi", "author": "Susanna Clarke", "isbn": "9781526622426"},
                                         "piranesi-clarke")
        self.assertTrue(exact)
        self.assertEqual(len(hits), 1)
        self.assertIn("q=isbn%3A9781526622426", self.fetch.asked[-1][0])
        self.assertEqual(self.source.fill(hits[0]).fields["isbn"], "9781526622426")
        hits, exact = self.source.lookup({"title": "Piranesi", "author": "Susanna Clarke", "isbn": None}, "piranesi")
        self.assertFalse(exact)                                 # by title, so the hit is picked
        self.assertIn("q=Piranesi+Susanna+Clarke", self.fetch.asked[-1][0])

    def test_pinned_edition_not_listed(self):
        def fetch(url, headers=None, data=None):
            if "/isbn/" in url:
                self.fetch.asked.append((url, data))
                return {"isbn_13": ["9780747532699"], "number_of_pages": 300, "covers": [123]}
            return self.fetch(url, headers, data)
        with mock.patch.object(openlibrary, "fetch_json", fetch):
            filled = self.source.fill(self.source.search("9780747532699")[0])
        self.assertIn("/isbn/9780747532699.json", self.fetch.asked[-1][0]) # not among its editions: asked for alone
        self.assertEqual((filled.fields["isbn"], filled.fields["pages"]), ("9780747532699", 300))
        self.assertEqual(filled.covers, {"cover": openlibrary.COVERS.format(123)}) # the edition's own cover
        self.assertNotIn("pages", filled.notes)

    def test_pages_of(self):
        for edition, pages in [({"number_of_pages": 272}, 272), ({"pagination": "912"}, 912),
                               ({"pagination": "xii, 340 p."}, 340), ({"pagination": "340 pages"}, 340),
                               ({"pagination": "2 v."}, None), ({}, None)]:
            self.assertEqual(openlibrary.pages_of(edition), pages)

    def test_choose(self):
        english = {"isbn_13": ["9781526622426"], "number_of_pages": 272, "publish_date": "2020",
                   "languages": [{"key": "/languages/eng"}]}
        editions = [
            {"isbn_13": ["9788418363283"], "number_of_pages": 272, "languages": [{"key": "/languages/spa"}]},
            {"isbn_13": ["9781526622419"], "number_of_pages": 272, "physical_format": "eAudiobook"},
            {"isbn_13": ["9781526622420"], "number_of_pages": 272},                    # bad checksum
            {"isbn_13": ["9781432895082"], "number_of_pages": 335, "publish_date": "2019"},  # large print, say
            english,
        ]
        self.assertIs(openlibrary.choose(editions, 272), english)
        self.assertIsNone(openlibrary.choose(editions[:3], 272))


class Wikidata(unittest.TestCase):
    def test_films(self):
        fetch = serve(("attack", "wikidata-films-attack-on-titan.json"), ("after", "wikidata-films-after-hours.json"))
        with mock.patch.object(wikidata, "fetch_json", fetch):
            after_hours, = wikidata.WikidataFilms().search("after hours 1985")
            titans = wikidata.WikidataFilms().search("attack on titan")
        self.assertIn("after+hours%22", fetch.asked[0][0])  # the year ranks hits, rather than being searched
        self.assertEqual(len(fetch.asked), 2)               # a request a search: no filling in
        self.assertEqual(after_hours.fields, {"title": "After Hours", "aliases": ["After Hours"], "kind": "film",
                                              "year": 1985, "director": "Martin Scorsese", "tmdb": "movie/10843"})
        self.assertTrue(after_hours.complete)
        self.assertEqual(after_hours.detail, "1985 film by Martin Scorsese")
        kinds = {(hit.title, hit.year): hit.fields["kind"] for hit in titans}
        self.assertEqual(kinds[("Attack on Titan", "2013")], "anime")
        self.assertEqual(kinds[("Attack on Titan", "2015")], "film")
        anime = next(hit for hit in titans if hit.year == "2013")
        self.assertEqual(anime.fields["tmdb"], "tv/1429")

    def test_games(self):
        fetch = serve(("hollow", "wikidata-games-hollow-knight.json"))
        with mock.patch.object(wikidata, "fetch_json", fetch):
            knight = wikidata.WikidataGames().search("hollow knight")[0]
        self.assertEqual(knight.fields, {"title": "Hollow Knight", "aliases": ["Hollow Knight"], "year": 2017,
                                         "developer": "Team Cherry", "igdb": "hollow-knight"})
        self.assertEqual(knight.covers, {}) # Wikidata has no covers

    def test_board_games(self):
        fetch = serve(("root", "wikidata-boardgames-root.json"))
        with mock.patch.object(wikidata, "fetch_json", fetch):
            root, = wikidata.WikidataBoardGames().search("root")
        self.assertIn("haswbstatement%3AP2339", fetch.asked[0][0]) # a name too common for the search box alone
        self.assertEqual(root.fields, {"title": "Root", "aliases": ["Root"], "year": 2018, "designer": "Cole Wehrle",
                                       "players": "2–4", "bgg": 237182})

    def test_lookup(self):
        # by an id the entry has, in place of a search: the hit is surely it
        for source, fields, prop, fixture in [
                (wikidata.WikidataFilms(), {"tmdb": "movie/10843"}, 'P4947+%2210843%22', "wikidata-films-after-hours.json"),
                (wikidata.WikidataFilms(), {"tmdb": "tv/1429"}, 'P4983+%221429%22', "wikidata-films-attack-on-titan.json"),
                (wikidata.WikidataGames(), {"igdb": "hollow-knight"}, 'P5794+%22hollow-knight%22',
                 "wikidata-games-hollow-knight.json"),
                (wikidata.WikidataBoardGames(), {"bgg": 237182}, 'P2339+%22237182%22', "wikidata-boardgames-root.json")]:
            fetch = serve(("query", fixture))
            with mock.patch.object(wikidata, "fetch_json", fetch): hits, exact = source.lookup(fields, "slug")
            self.assertTrue(exact and hits)
            self.assertIn(prop, fetch.asked[0][0])
            self.assertNotIn("mwapi", fetch.asked[0][0])
        # without one, by its title & year (which ranks the hits)
        fetch = serve(("Hours", "wikidata-films-after-hours.json"))
        with mock.patch.object(wikidata, "fetch_json", fetch):
            hits, exact = wikidata.WikidataFilms().lookup({"title": "After Hours", "year": 1985, "tmdb": None}, "s")
        self.assertFalse(exact)
        self.assertEqual(hits[0].fields["tmdb"], "movie/10843")
        self.assertIn("After+Hours%22", fetch.asked[0][0])

    def test_players(self):
        self.assertEqual(wikidata.players("2", "4"), "2–4")
        self.assertEqual(wikidata.players("2", "2"), "2")
        self.assertEqual(wikidata.players("3", None), "3+")
        self.assertEqual(wikidata.players(None, "6"), "up to 6")
        self.assertIsNone(wikidata.players(None, None))

    def test_series(self):
        with mock.patch.object(wikidata, "fetch_json", serve(("OL453735W", "wikidata-series-guards-guards.json"))):
            fields, notes = wikidata.series_of("OL453735W")
        self.assertEqual(fields, {"series": "Discworld", "series-number": 8}) # the broadest series
        self.assertIn("City Watch", notes["series"])
        with mock.patch.object(wikidata, "fetch_json", serve(("OL20893680W", "wikidata-series-piranesi.json"))):
            self.assertEqual(wikidata.series_of("OL20893680W"), ({}, {}))

    def test_literal(self):
        self.assertEqual(wikidata.literal('say "hi"\\n  there'), 'say \\"hi\\"\\\\n there')


def zotero_database(path: Path):
    """A database laid out as Zotero's (the tables dork reads), holding a few items."""
    con = sqlite3.connect(path)
    con.executescript("""
        CREATE TABLE itemTypes (itemTypeID INTEGER PRIMARY KEY, typeName TEXT);
        CREATE TABLE items (itemID INTEGER PRIMARY KEY, itemTypeID INT);
        CREATE TABLE deletedItems (itemID INT);
        CREATE TABLE fieldsCombined (fieldID INTEGER PRIMARY KEY, fieldName TEXT);
        CREATE TABLE itemDataValues (valueID INTEGER PRIMARY KEY, value);
        CREATE TABLE itemData (itemID INT, fieldID INT, valueID INT);
        CREATE TABLE creatorTypes (creatorTypeID INTEGER PRIMARY KEY, creatorType TEXT);
        CREATE TABLE creators (creatorID INTEGER PRIMARY KEY, firstName TEXT, lastName TEXT, fieldMode INT);
        CREATE TABLE itemCreators (itemID INT, creatorID INT, creatorTypeID INT, orderIndex INT);
        INSERT INTO itemTypes VALUES (1, 'book'), (2, 'preprint'), (3, 'attachment');
        INSERT INTO creatorTypes VALUES (1, 'author'), (2, 'editor'), (3, 'translator');
    """)
    fields = {}

    def item(item_id, kind, data, creators=()):
        con.execute("INSERT INTO items VALUES (?, ?)", (item_id, kind))
        for name, value in data.items():
            fields.setdefault(name, len(fields) + 1)
            con.execute("INSERT OR IGNORE INTO fieldsCombined VALUES (?, ?)", (fields[name], name))
            value_id = con.execute("INSERT INTO itemDataValues (value) VALUES (?)", (value,)).lastrowid
            con.execute("INSERT INTO itemData VALUES (?, ?, ?)", (item_id, fields[name], value_id))
        for i, (role, first, last, single) in enumerate(creators):
            creator = con.execute("INSERT INTO creators (firstName, lastName, fieldMode) VALUES (?, ?, ?)",
                                  (first, last, single)).lastrowid
            con.execute("INSERT INTO itemCreators VALUES (?, ?, ?, ?)", (item_id, creator, role, i))

    item(1, 1, {"title": "Naming and necessity", "date": "1980-00-00 1980", "citationKey": "kripkeNamingNecessity1980",
                "ISBN": "0-674-59845-8 978-0-674-59845-4", "publisher": "Harvard University Press"},
         [(1, "Saul A.", "Kripke", 0)])
    item(2, 2, {"title": "Evaluating large language models", "date": "2021-07-07 2021",
                "citationKey": "chenEvaluatingLargeLanguage2021", "archiveID": "arXiv:2107.03374",
                "DOI": "10.48550/arXiv.2107.03374", "url": "http://arxiv.org/abs/2107.03374"},
         [(1, "Mark", "Chen", 0), (1, "Jerry", "Tworek", 0), (1, "Heewoo", "Jun", 0)])
    item(3, 1, {"title": "Meditations", "shortTitle": "Meditations", "date": "2002",
                "citationKey": "aureliusMeditations2002", "ISBN": "not an isbn"},
         [(1, "", "Marcus Aurelius", 1), (3, "Gregory", "Hays", 0)])
    item(4, 1, {"title": "Deleted", "citationKey": "deletedItem2000"})
    con.execute("INSERT INTO deletedItems VALUES (4)")
    item(5, 3, {"title": "an attachment", "citationKey": "attachmentKey"})
    item(6, 1, {"title": "No key"})
    item(7, 1, {"title": "Edited volume", "date": "2010", "citationKey": "editorEdited2010"}, [(2, "Ed", "Itor", 0)])
    con.commit()
    con.close()


class Zotero(unittest.TestCase):
    def setUp(self):
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.db = Path(scratch.name) / "zotero.sqlite"
        zotero_database(self.db)
        patch = mock.patch.object(zotero, "database", lambda: self.db)
        patch.start()
        self.addCleanup(patch.stop)
        self.source = zotero.Zotero()

    def test_items(self):
        items = {hit.id: hit for hit in self.source.items()}
        self.assertEqual(set(items), {"kripkeNamingNecessity1980", "chenEvaluatingLargeLanguage2021",
                                      "aureliusMeditations2002", "editorEdited2010"}) # no deleted, attached, keyless
        kripke = items["kripkeNamingNecessity1980"]
        self.assertEqual(kripke.fields, {"title": "Naming and Necessity", "aliases": ["Naming and Necessity"],
                                         "kind": "book", "authors": ["Saul A. Kripke"], "translator": None,
                                         "year": 1980, "isbn": "9780674598454", "doi": None, "arxiv": None,
                                         "url": None})
        self.assertEqual(kripke.extra["slug"], "kripkeNamingNecessity1980")
        paper = items["chenEvaluatingLargeLanguage2021"]
        self.assertEqual((paper.fields["kind"], paper.fields["arxiv"], paper.fields["doi"], paper.creator),
                         ("paper", "2107.03374", "10.48550/arXiv.2107.03374", "Mark Chen et al."))
        aurelius = items["aureliusMeditations2002"]
        self.assertEqual((aurelius.fields["authors"], aurelius.fields["translator"], aurelius.fields["isbn"]),
                         (["Marcus Aurelius"], "Gregory Hays", None))
        self.assertEqual(items["editorEdited2010"].fields["authors"], ["Ed Itor"]) # editors, when there are no authors

    def test_search(self):
        self.assertEqual([h.id for h in self.source.search("kripke nam")], ["kripkeNamingNecessity1980"])
        self.assertEqual([h.id for h in self.source.search("krpk")], []) # letters scattered aren't enough
        self.assertEqual(self.source.search(" "), [])

    def test_lookup(self):
        hits, exact = self.source.lookup({"title": "Something else"}, "kripkeNamingNecessity1980") # by citation key
        self.assertTrue(exact)
        self.assertEqual([h.id for h in hits], ["kripkeNamingNecessity1980"])
        hits, exact = self.source.lookup({"title": "Meditations"}, "aureliusMeditations")
        self.assertFalse(exact)
        self.assertEqual([h.id for h in hits], ["aureliusMeditations2002"])

    def test_read_only(self):
        before = hashlib.sha256(self.db.read_bytes()).hexdigest()
        self.source.items()
        with self.assertRaises(sqlite3.OperationalError): zotero.connect(self.db).execute("CREATE TABLE x (y)")
        self.assertEqual(hashlib.sha256(self.db.read_bytes()).hexdigest(), before)
        self.assertEqual(sorted(os.listdir(self.db.parent)), ["zotero.sqlite"]) # no journal, lock, or WAL files


@unittest.skipUnless(zotero.database(), "no Zotero database here")
class RealZotero(unittest.TestCase):
    def test_untouched(self):
        """Reading the real Zotero database changes nothing of it, or beside it."""
        db = zotero.database()
        before, listing = hashlib.sha256(db.read_bytes()).hexdigest(), sorted(os.listdir(db.parent))
        source = zotero.Zotero()
        self.assertTrue(source.items())
        source.search("the")
        self.assertEqual(hashlib.sha256(db.read_bytes()).hexdigest(), before)
        self.assertEqual(sorted(os.listdir(db.parent)), listing)


class Net(unittest.TestCase):
    def setUp(self):
        net._cache.clear()
        net._last.clear()
        self.sent = []

        class Response:
            def __init__(self, request): self.request = request
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def read(self): return b'{"ok": true}'

        def urlopen(request, timeout):
            self.sent.append((time.monotonic(), request))
            return Response(request)

        patch = mock.patch.object(net, "urlopen", urlopen)
        patch.start()
        self.addCleanup(patch.stop)

    def test_cached(self):
        self.assertEqual(net.fetch_json("https://example.org/a"), {"ok": True})
        net.fetch_json("https://example.org/a")
        self.assertEqual(len(self.sent), 1)
        net.fetch("https://example.org/a", cache=False)
        self.assertEqual(len(self.sent), 2)

    def test_polite(self):
        with mock.patch.dict(net.INTERVALS, {"example.org": 0.3}):
            net.fetch("https://example.org/a")
            net.fetch("https://example.org/b")
        (first, request), (second, _) = self.sent
        self.assertGreaterEqual(second - first, 0.29)
        self.assertIn("github.com/dariotrinchero/dork-fort", request.get_header("User-agent"))

    def test_log(self):
        with tempfile.TemporaryDirectory() as scratch:
            log = Path(scratch) / "requests.log"
            with mock.patch.dict(os.environ, {"DORK_LOG": str(log)}):
                net.fetch("https://example.org/logged")
            self.assertIn("GET https://example.org/logged → 12 bytes", log.read_text())


if __name__ == "__main__":
    unittest.main()
