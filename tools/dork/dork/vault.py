"""The vault's notes, read & written back. Writing keeps every line of frontmatter whose value hasn't changed
exactly as it was (Obsidian, vim & the import each quote things their own way), & writes changed values in the
templates' style: flow lists, quoted ISBNs & partial dates, & empty values bare."""

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .schema import CONTENT
from .validate import FRONTMATTER, read_frontmatter
from .yamlcore import load

# a line of frontmatter starting a top-level key, eg. "recommended-by: JS"
KEY = re.compile(r"^([A-Za-z0-9_][\w-]*):(?=\s|$)")


@dataclass
class Entry:
    """A note of a collection: its frontmatter (as read, & as lines, by key), & everything around it."""
    collection: str
    path: Path
    fields: dict
    blocks: list[tuple[str | None, str]] # lines of frontmatter, by top-level key (None for any before the first)
    head: str = "---\n"                  # frontmatter's opening & closing lines, as they were
    tail: str = "\n---\n"
    body: str = ""

    @property
    def slug(self) -> str: return self.path.stem

    @property
    def file(self) -> str: return f"{self.collection}/{self.path.name}"


def parse(collection: str, path: Path, text: str) -> Entry | None:
    """Entry of note, from its text, or None if it has no frontmatter."""
    match = FRONTMATTER.match(text)
    if not match: return None
    blocks: list[tuple[str | None, str]] = []
    for line in match[1].split("\n"):
        key = KEY.match(line)
        if key or not blocks: blocks.append((key[1] if key else None, line))
        else: blocks[-1] = (blocks[-1][0], blocks[-1][1] + "\n" + line) # a list item, say, of the key above
    return Entry(collection, path, read_frontmatter(text), blocks, text[:match.start(1)],
                 text[match.end(1):match.end()], text[match.end():])


def template_order(schema: dict, name: str, content: Path = CONTENT) -> list[str]:
    """Keys of collection's (first) template, in order."""
    text = (content / "Templates" / schema["collections"][name]["templates"][0]).read_text(encoding="utf-8")
    return re.findall(r"^([\w-]+):", FRONTMATTER.match(text)[1], re.M)


def tracked(schema: dict) -> list[str]:
    """Names of collections with a status (novels, nonfiction, films & games), in schema's order."""
    return [name for name, collection in schema["collections"].items() if collection.get("status")]


def load_entries(schema: dict, names: list[str], content: Path = CONTENT) -> list[Entry]:
    """Every note of collections that has frontmatter (dork check reports those that don't)."""
    entries = []
    for name in names:
        for path in sorted((content / name).glob("*.md")):
            entry = parse(name, path, path.read_text(encoding="utf-8"))
            if entry: entries.append(entry)
    return entries


def new_entry(schema: dict, name: str, content: Path = CONTENT) -> Entry:
    """Entry of a note not yet written: its collection's (first) template, filled in with nothing more (a date
    placeholder, as in the Post template, is today). Its path is a placeholder too, until the note is saved."""
    from datetime import date
    template = (content / "Templates" / schema["collections"][name]["templates"][0]).read_text(encoding="utf-8")
    template = template.replace("{{date}}", date.today().isoformat())
    return parse(name, content / name / ".new.md", template)


def reload(entry: Entry) -> Entry:
    """Entry as now on disk."""
    return parse(entry.collection, entry.path, entry.path.read_text(encoding="utf-8")) or entry


#---- writing frontmatter --------------------------------------------------------------------------

def same(a, b) -> bool:
    """Whether values are the same, type & all (so 1 isn't True, & 4 isn't 4.0)."""
    if isinstance(a, list) and isinstance(b, list): return len(a) == len(b) and all(map(same, a, b))
    return type(a) is type(b) and a == b


def _reads_as(text: str, value) -> bool:
    """Whether YAML reads text as value, both by the site's rules (YAML 1.2) & by YAML 1.1's (as some tools
    still do), so that a value written plain means the same to everything that reads it."""
    try: return all(same(read(text), value) for read in (load, yaml.safe_load))
    except yaml.YAMLError: return False


def scalar(value, kind: str | None = None, in_list: bool = False) -> str:
    """Value as YAML, plain where that reads back the same, else in double quotes. Full dates are plain & partial
    dates quoted, as in the templates."""
    if value is None: return ""
    if isinstance(value, bool): return "true" if value else "false"
    if isinstance(value, float) and value.is_integer(): value = int(value)
    if isinstance(value, (int, float)): return repr(value)
    text = str(value)
    if kind in ("date", "partial-date"): return text if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text) else json.dumps(text)
    plain = text == text.strip() and "\n" not in text and \
        _reads_as(f"[{text}]" if in_list else text, [text] if in_list else text)
    return text if plain else json.dumps(text, ensure_ascii=False)


def emit(key: str, value, kind: str | None = None) -> str:
    """Line of frontmatter giving key its value; lists flow, as in the templates (eg. "tags: [a, b]")."""
    if value is None or value == "": return f"{key}:"
    if isinstance(value, list): return f"{key}: [{', '.join(scalar(item, kind, True) for item in value)}]"
    return f"{key}: {scalar(value, kind)}"


def render(entry: Entry, fields: dict, order: list[str], kinds: dict[str, str] | None = None) -> str:
    """Text of note with frontmatter giving fields: lines of keys whose values are unchanged are kept as they
    were, changed ones are rewritten, removed ones dropped, & new ones put where order (the template's) says."""
    kinds = kinds or {}
    lines = []
    for key, text in entry.blocks:
        if key is None: lines.append((key, text))
        elif key in fields:
            unchanged = key in entry.fields and same(fields[key], entry.fields[key])
            lines.append((key, text if unchanged else emit(key, fields[key], kinds.get(key))))

    rank = {key: i for i, key in enumerate(order)}
    place = lambda key: rank.get(key, len(rank)) # unknown keys last
    for key in sorted((k for k in fields if k not in entry.fields), key=place):
        # after the last line whose key comes before it in the template, else after any lines before the first key
        before = [i for i, (k, _) in enumerate(lines) if k is None or place(k) < place(key)]
        lines.insert(before[-1] + 1 if before else 0, (key, emit(key, fields[key], kinds.get(key))))
    return entry.head + "\n".join(text for _, text in lines) + entry.tail + entry.body


#---- changes, undoably ----------------------------------------------------------------------------

@dataclass
class Changes:
    """Files written (or removed) together, & what they held before, to undo them."""
    before: dict[Path, bytes | None] = field(default_factory=dict)

    def _keep(self, path: Path):
        if path not in self.before: self.before[path] = path.read_bytes() if path.exists() else None

    def write(self, path: Path, data: str | bytes):
        self._keep(path)
        _write(path, data)

    def remove(self, path: Path):
        self._keep(path)
        path.unlink(missing_ok=True)

    def undo(self):
        for path, text in self.before.items():
            if text is None: path.unlink(missing_ok=True)
            else: _write(path, text)


def _write(path: Path, data: str | bytes):
    """Write file whole or not at all (through a temporary file, renamed over it)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.dork")
    temporary.write_bytes(data.encode("utf-8") if isinstance(data, str) else data)
    os.replace(temporary, path)


def links_to(slug: str) -> re.Pattern:
    """Pattern of the start of wikilinks to note, eg. "[[the-cave-saramago" of "[[the-cave-saramago|The Cave]]"."""
    return re.compile(rf"\[\[{re.escape(slug)}(?=[\]|#])")


def save(entry: Entry, fields: dict, order: list[str], kinds: dict[str, str], slug: str | None = None,
         content: Path = CONTENT) -> Changes:
    """Write entry with fields, renamed to slug if given (& then rewriting wikilinks to it across the vault); a new
    entry (not yet on disk) is simply written, named slug."""
    changes = Changes()
    path = entry.path if slug is None or slug == entry.slug else entry.path.with_name(f"{slug}.md")
    text = render(entry, fields, order, kinds)
    if not entry.path.exists():
        changes.write(path, text)
        return changes
    if path == entry.path:
        if not entry.path.exists() or text != entry.path.read_text(encoding="utf-8"): changes.write(path, text)
        return changes

    changes.write(path, text)
    if entry.path.exists(): changes.remove(entry.path)
    pattern = links_to(entry.slug)
    for note in content.rglob("*.md"):
        if any(part.startswith(".") for part in note.relative_to(content).parts): continue
        original = note.read_text(encoding="utf-8")
        if pattern.search(original): changes.write(note, pattern.sub(f"[[{slug}", original))
    return changes
