"""Tests of dork's validator, on the cases the build's validator must also pass (tests/validators.yaml), on the
vault itself, & against the build's validator directly, on a copy of the vault with all manner of problems.

Run with: python3 -m unittest discover tools/dork/tests
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dork.schema import CONTENT, load_schema
from dork.validate import check_entry, check_value, validate_vault
from dork.yamlcore import load

REPO = Path(__file__).resolve().parents[3]
CASES = load((REPO / "tests/validators.yaml").read_text(encoding="utf-8"))


class SharedCases(unittest.TestCase):
    def test_parsing(self):
        for case in CASES["parsing"]:
            with self.subTest(yaml=case["yaml"]):
                self.assertEqual(load(case["yaml"]), json.loads(case["json"]))

    def test_types(self):
        for name, case in CASES["types"].items():
            for value in case["valid"]:
                with self.subTest(type=name, valid=value):
                    self.assertIsNone(check_value(case["field"], value))
            for value in case["invalid"]:
                with self.subTest(type=name, invalid=value):
                    self.assertIsNotNone(check_value(case["field"], value))

    def test_entries(self):
        schema = load_schema()
        for case in CASES["entries"]:
            with self.subTest(collection=case["collection"], slug=case["slug"], fields=case["fields"]):
                wrong = {field for field, _ in check_entry(schema, case["collection"], case["slug"], case["fields"])}
                self.assertEqual(sorted(wrong), sorted(case["errors"]))


class Vault(unittest.TestCase):
    def test_vault_is_valid(self):
        self.assertEqual([str(problem) for problem in validate_vault()], [])


def _edit(path: Path, *replacements: tuple[str, str]):
    """Replace text in file, each replacement by regex (on lines), insisting that each matches."""
    text = path.read_text(encoding="utf-8")
    for pattern, replacement in replacements:
        text, count = re.subn(pattern, replacement, text, count=1, flags=re.M)
        assert count, f"{pattern} not in {path}"
    path.write_text(text, encoding="utf-8")


@unittest.skipUnless(shutil.which("node") and (REPO / "node_modules/yaml").exists(), "needs node & npm install")
class Parity(unittest.TestCase):
    """Both validators find the very same problems in a copy of the vault broken in every way they check."""

    def test_same_problems(self):
        with tempfile.TemporaryDirectory() as scratch:
            vault = Path(scratch) / "content"
            shutil.copytree(CONTENT, vault, ignore=shutil.ignore_patterns(".obsidian", ".trash"))
            novel, film, paper = (sorted((vault / name).glob("*.md"))[0] for name in ("novels", "films", "nonfiction"))
            _edit(novel, (r"^status: .*", "status: watched"), (r"^tags: .*", 'tags: [Fantasy, "magical realism"]'))
            _edit(novel, (r"^translator:.*", "translator:\nseries-number: 3"))  # a number without a series
            twins = sorted((vault / "novels").glob("*pratchett.md"))[:2]                # two Discworld 8s
            for twin in twins: _edit(twin, (r"^translator:.*", "translator:\nseries: Discworld\nseries-number: 8"))
            _edit(film, (r"^rating:.*", "rating: 4.6"), (r"^recommended-by:.*", "recommended-by: John"),
                  (r"^year: .*", "year: 1985.5"), (r"^finished:.*", "finished: 2023"))
            _edit(paper, (r"^isbn: .*", 'isbn: "9780670022411"'), (r"^title:", "foo: bar\ntitle:"),
                  (r"^kind: .*", "kind: essay"), (r"^doi:.*", "doi: doi:10.1000/x"))
            _edit(vault / "Templates/Film.md", (r"^tags:", "extra:\ntags:"))
            _edit(vault / "Templates/List.md", (r"^draft:.*\n", ""))
            _edit(next((vault / "games").glob("*.md")), (r"^cover:.*", "cover: attachments/covers/missing.jpg"))
            shutil.copy(film, vault / "novels" / film.name) # same URL as the film, & fields of films
            (vault / "novels/No Frontmatter.md").write_text("Just a body.\n", encoding="utf-8")
            (vault / "recipes").mkdir()
            adventure = next((vault / "adventures").glob("*.md"))
            adventure.rename(adventure.with_name("1999-01-01-" + adventure.name[11:]))

            ours = sorted((p.file, p.field, p.message) for p in validate_vault(vault))
            output = subprocess.run(["node", str(REPO / "scripts/validateContent.js"), "--json", str(vault)],
                                    capture_output=True, text=True, cwd=REPO).stdout
            theirs = sorted((p["file"], p.get("field"), p["message"]) for p in json.loads(output))
            self.assertGreater(len(ours), 15)
            self.assertEqual(ours, theirs)


if __name__ == "__main__":
    unittest.main()
