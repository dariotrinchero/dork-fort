"""Tests of reading & writing notes (byte for byte where nothing changed), slugs, fuzzy matching (against the
site's own src/fuzzy.ts), & quick actions, on a scratch copy of the vault.

Run with: python3 -m unittest discover tools/dork/tests
"""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dork import actions
from dork.fuzzy import fuzzy_match
from dork.schema import CONTENT, load_schema
from dork.slugs import make_slug, short, slugify, surname
from dork.vault import emit, load_entries, parse, reload, render, save, template_order, tracked
from dork.yamlcore import load

REPO = Path(__file__).resolve().parents[3]
SCHEMA = load_schema()


class Writing(unittest.TestCase):
    def test_round_trip(self):
        """Rendering any note without changes gives it back byte for byte."""
        for name in SCHEMA["collections"]:
            order = template_order(SCHEMA, name)
            for entry in load_entries(SCHEMA, [name]):
                with self.subTest(file=entry.file):
                    self.assertEqual(render(entry, entry.fields, order), entry.path.read_text(encoding="utf-8"))

    def test_emit(self):
        cases = [
            ("isbn", "9780670022410", "isbn", 'isbn: "9780670022410"'),
            ("finished", "2024-05", "partial-date", 'finished: "2024-05"'),
            ("finished", "2023", "partial-date", 'finished: "2023"'),
            ("finished", "2024-06-28", "partial-date", "finished: 2024-06-28"),
            ("title", "Dune: Part Two", "text", 'title: "Dune: Part Two"'),
            ("title", "Howl's Moving Castle", "text", "title: Howl's Moving Castle"),
            ("title", "1984", "text", 'title: "1984"'),
            ("title", "yes", "text", 'title: "yes"'),
            ("title", "#hashtag", "text", 'title: "#hashtag"'),
            ("title", "a # b", "text", 'title: "a # b"'),
            ("aliases", ["Dune: Part Two", "Dune 2"], "list", 'aliases: ["Dune: Part Two", Dune 2]'),
            ("aliases", ["I Hate People, People Hate Me"], "list", 'aliases: ["I Hate People, People Hate Me"]'),
            ("tags", [], "list", "tags: []"),
            ("rating", 4.75, "rating", "rating: 4.75"),
            ("rating", 4.0, "rating", "rating: 4"),
            ("rating", None, "rating", "rating:"),
            ("owned", True, "bool", "owned: true"),
            ("translator", "", "text", "translator:"),
        ]
        for key, value, kind, line in cases:
            with self.subTest(value=value):
                self.assertEqual(emit(key, value, kind), line)
                read = load(line)[key]
                self.assertEqual(read, None if value == "" else int(value) if value == 4.0 else value)

    def test_changes_touch_only_their_lines(self):
        entry = next(e for e in load_entries(SCHEMA, ["films"]) if e.slug == "after-hours-1985")
        order, original = template_order(SCHEMA, "films"), entry.path.read_text(encoding="utf-8")
        text = render(entry, {**entry.fields, "rating": 4.5}, order)
        diff = [(a, b) for a, b in zip(original.splitlines(), text.splitlines()) if a != b]
        self.assertEqual(diff, [("rating:", "rating: 4.5")])

    def test_new_keys_follow_template_order(self):
        entry = parse("films", Path("x.md"), "---\ntitle: X\nstatus: to-watch\n---\nBody\n")
        new = {**entry.fields, "year": 1985, "tags": ["a"], "aliases": ["X"]}
        text = render(entry, new, template_order(SCHEMA, "films"))
        self.assertEqual(text, "---\ntitle: X\naliases: [X]\nyear: 1985\nstatus: to-watch\ntags: [a]\n---\nBody\n")

    def test_block_lists(self):
        """Lists Obsidian writes in block style are kept unless changed, & then written in flow style."""
        entry = parse("films", Path("x.md"), "---\ntitle: X\ntags:\n  - a\n  - b\nstatus: to-watch\n---\n")
        order = template_order(SCHEMA, "films")
        self.assertEqual(render(entry, entry.fields, order),
                         "---\ntitle: X\ntags:\n  - a\n  - b\nstatus: to-watch\n---\n")
        self.assertEqual(render(entry, {**entry.fields, "tags": ["a"]}, order),
                         "---\ntitle: X\ntags: [a]\nstatus: to-watch\n---\n")


class Slugs(unittest.TestCase):
    def test_parts(self):
        self.assertEqual(slugify("Howl's Moving Castle"), "howls-moving-castle")
        self.assertEqual(slugify("Legends & Lattes"), "legends-and-lattes")
        self.assertEqual(slugify("José Saramago"), "jose-saramago")
        self.assertEqual(short("Dune: Part Two"), "Dune")
        self.assertEqual(surname("Ursula K. Le Guin"), "Le Guin")
        self.assertEqual(surname("Terry Pratchett"), "Pratchett")
        self.assertEqual(surname("Plato"), "Plato")

    def test_existing_names(self):
        """Rules give the names already in the vault (but for one shortened by hand)."""
        for name in ("novels", "films"):
            rule = SCHEMA["collections"][name]["slug"]["from"]
            for entry in load_entries(SCHEMA, [name]):
                if entry.slug == "dr-strangelove-1964": continue
                with self.subTest(file=entry.file):
                    self.assertEqual(make_slug(rule, entry.fields), entry.slug)


@unittest.skipUnless(shutil.which("node"), "needs node")
class Fuzzy(unittest.TestCase):
    def test_matches_site(self):
        """Port gives the same matches & scores as src/fuzzy.ts."""
        titles = [actions.haystack(e) for e in load_entries(SCHEMA, tracked(SCHEMA))]
        queries = ["witch", "the", "dune pa", "pratchett gu", "a", "zz", "mov cast", "ok", "e e e", "sta wa"]
        pairs = [(q, t) for q in queries for t in titles]
        script = ('import { readFileSync } from "fs"; const { fuzzyMatch } = await import("./src/fuzzy.ts");'
                  'const pairs = JSON.parse(readFileSync(0, "utf8"));'
                  'console.log(JSON.stringify(pairs.map(([q, t]) => { const m = fuzzyMatch(q, t);'
                  ' return m && [[...m.indices].sort((a, b) => a - b), m.score]; })));')
        run = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
                              script], input=json.dumps(pairs), capture_output=True, text=True, cwd=REPO)
        if run.returncode: self.skipTest(f"node can't run src/fuzzy.ts: {run.stderr.strip()[:200]}")
        theirs = json.loads(run.stdout)
        ours = [(lambda m: m and [sorted(m[0]), m[1]])(fuzzy_match(q, t)) for q, t in pairs]
        self.assertEqual(ours, theirs)


class Actions(unittest.TestCase):
    def setUp(self):
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.vault = Path(scratch.name) / "content"
        shutil.copytree(CONTENT, self.vault, ignore=shutil.ignore_patterns(".obsidian", ".trash"))
        self.entries = load_entries(SCHEMA, tracked(SCHEMA), self.vault)

    def entry(self, slug):
        return next(e for e in self.entries if e.slug == slug)

    def test_finish_then_undo(self):
        entry = self.entry("a-discovery-of-witches-harkness")
        original = entry.path.read_text(encoding="utf-8")
        outcome = actions.act(SCHEMA, entry, "finish")
        self.assertFalse(outcome.failed, outcome.message)
        self.assertEqual(outcome.message, f"novels/{entry.path.name}: to-read → read, finished {actions.today()}")
        after = reload(entry)
        self.assertEqual((after.fields["status"], after.fields["finished"]), ("read", actions.today()))
        outcome.changes.undo()
        self.assertEqual(entry.path.read_text(encoding="utf-8"), original)

    def test_refuses_to_break_entries(self):
        finished = next(e for e in self.entries if e.fields.get("finished") and e.fields["status"] == "read")
        outcome = actions.act(SCHEMA, finished, "pause")
        self.assertTrue(outcome.failed)
        self.assertIn("finished should be empty while paused", outcome.message)
        self.assertEqual(reload(finished).fields, finished.fields)

    def test_already(self):
        entry = next(e for e in self.entries if e.fields["status"] == "watched")
        self.assertTrue(actions.act(SCHEMA, entry, "finish").failed)

    def test_rate(self):
        entry = self.entry("after-hours-1985")
        outcome = actions.act(SCHEMA, entry, "rate", 4.25)
        self.assertEqual(outcome.message, "films/after-hours-1985.md: rating ★★★★¼")
        self.assertEqual(reload(entry).fields["rating"], 4.25)
        self.assertTrue(actions.act(SCHEMA, entry, "rate", 4.6).failed)

    def test_rename_rewrites_links(self):
        entry = self.entry("arrietty-2010")
        page = self.vault / "pages/favourite-films.md"
        self.assertIn("[[arrietty-2010|", page.read_text(encoding="utf-8"))
        changes = save(entry, entry.fields, template_order(SCHEMA, "films"), {}, "the-secret-world-of-arrietty-2010",
                       self.vault)
        self.assertFalse(entry.path.exists())
        self.assertTrue((self.vault / "films/the-secret-world-of-arrietty-2010.md").exists())
        self.assertIn("[[the-secret-world-of-arrietty-2010|", page.read_text(encoding="utf-8"))
        changes.undo()
        self.assertTrue(entry.path.exists())
        self.assertFalse((self.vault / "films/the-secret-world-of-arrietty-2010.md").exists())
        self.assertIn("[[arrietty-2010|", page.read_text(encoding="utf-8"))


class Finding(unittest.TestCase):
    def setUp(self):
        def entry(collection, slug, title, status, **fields):
            lines = [emit(key, value) for key, value in {"title": title, "status": status, **fields}.items()]
            return parse(collection, Path(f"{slug}.md"), "---\n" + "\n".join(lines) + "\n---\n")

        self.entries = [
            entry("novels", "a-discovery-of-witches-harkness", "A Discovery of Witches", "to-read",
                  author="Deborah Harkness"),
            entry("novels", "witches-abroad-pratchett", "Witches Abroad", "read", author="Terry Pratchett"),
            entry("films", "the-witches-1990", "The Witches", "to-watch", director="Nicolas Roeg"),
            entry("films", "dune-2021", "Dune", "watched", director="Denis Villeneuve"),
            entry("films", "dune-part-two-2024", "Dune: Part Two", "to-watch", director="Denis Villeneuve"),
        ]

    def test_clear_best(self):
        best = lambda query, action="finish": (lambda e: e and e.slug)(
            actions.clear_best(SCHEMA, actions.applicable(SCHEMA, self.entries, action), query))
        self.assertEqual(best("discovery of witches"), "a-discovery-of-witches-harkness")
        self.assertEqual(best("harkness"), "a-discovery-of-witches-harkness")
        self.assertIsNone(best("witches"))
        self.assertEqual(best("dune"), "dune-part-two-2024")         # the one not yet watched
        self.assertEqual(best("dune", "rate"), "dune-2021")          # the one titled just that
        self.assertIsNone(best("zzz"))
        self.assertEqual(best("dune", "dnf"), "dune-part-two-2024")     # not dropping what's watched

    def test_scattered_letters_never_act(self):
        """Fuzzy matches letter by letter only open the finder: "dune" mustn't act on "Jury Duty"."""
        watched = [e for e in self.entries if not e.slug.startswith("dune")]
        jury = parse("films", Path("jury-duty-2023.md"), "---\ntitle: Jury Duty\nstatus: to-watch\n"
                     "director: Lee Eisenberg\n---\n")
        self.assertTrue(actions.rank(SCHEMA, [jury], "dune"))
        self.assertIsNone(actions.clear_best(SCHEMA, [*watched, jury], "dune"))
        self.assertEqual(actions.clear_best(SCHEMA, [jury], "jury"), jury)
        cave = parse("novels", Path("the-cave-saramago.md"), "---\ntitle: The Cave\nstatus: to-read\n"
                     "author: José Saramago\n---\n")
        self.assertEqual(actions.clear_best(SCHEMA, [cave, jury], "jose"), cave) # accents aside


if __name__ == "__main__":
    unittest.main()
