"""Validation of notes against the vault's schema: the same rules as the build's (scripts/validateContent.js), &
passing the same cases (tests/validators.yaml). Only what the build rejects belongs here; dork's warnings about
merely suspicious values live elsewhere."""

import json
import math
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from .schema import CONTENT, load_schema
from .yamlcore import load

FRONTMATTER = re.compile(r"^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)")

# folders of vault holding no collection
NOT_COLLECTIONS = {"Templates", "Bases", "attachments"}


@dataclass
class Problem:
    """Something wrong in the vault: in a file (from the vault), maybe in one field (or "slug")."""
    file: str
    message: str
    field: str | None = None

    def __str__(self) -> str:
        return f"{self.file}: {self.field + ' ' if self.field else ''}{self.message}"


def is_empty(value) -> bool:
    """Whether field value says nothing (eg. "rating:" not yet filled in)."""
    return value is None or value == "" or value == []


def _is_int(value) -> bool: return isinstance(value, int) and not isinstance(value, bool)
def _is_number(value) -> bool:
    return (_is_int(value) or isinstance(value, float)) and math.isfinite(value)


def _is_partial_date(text: str) -> bool:
    """Whether string is a real date, as precise as known ("2024-06-28", "2024-05", or "2023")."""
    match = re.fullmatch(r"(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?", text)
    if not match: return False
    try: date(int(match[1]), int(match[2] or 1), int(match[3] or 1))
    except ValueError: return False
    return True


def _is_isbn(text: str) -> bool:
    """Whether string is an ISBN-10 or ISBN-13 (digits only) with a valid checksum."""
    if re.fullmatch(r"\d{9}[\dX]", text):
        return sum((10 - i) * (10 if c == "X" else int(c)) for i, c in enumerate(text)) % 11 == 0
    if re.fullmatch(r"97[89]\d{10}", text):
        return sum((3 if i % 2 else 1) * int(c) for i, c in enumerate(text)) % 10 == 0
    return False


KEBAB = r"[a-z0-9]+(?:-[a-z0-9]+)*"

# patterns of string types, & what to say of strings that don't match
PATTERNS = {
    "tag": (rf"(?=.*[a-z]){KEBAB}(?:/{KEBAB})*", "should be lowercase & hyphens"),
    "date": (r"\d{4}-\d{2}-\d{2}", "should be a date, eg. 2024-06-28"),
    "time": (r"\d+:[0-5]\d", 'should be a duration, eg. "3:45"'),
    "initials": (r"[A-Z]{2,3}", "should be initials, eg. JS"),
    "doi": (r"10\.\d{4,9}/\S+", "should be a DOI, eg. 10.1000/xyz123"),
    "arxiv": (r"(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?/\d{7})(?:v\d+)?", "should be an arXiv id, eg. 2107.03374"),
    "url": (r"https?://\S+", "should be a URL"),
    "tmdb": (r"(?:movie|tv)/\d+", "should be movie/<id> or tv/<id>"),
    "igdb": (KEBAB, "should be a slug on IGDB"),
}


def check_value(field: dict, value, statuses: list[str] = ()) -> str | None:
    """What is wrong with (non-empty) value of field (or item of list field), given its type, or None."""
    kind = field["type"]
    is_str = isinstance(value, str)
    quote = "" if is_str else " (quote it, so YAML reads it as text)"
    match kind:
        case "text": return None if is_str else f"should be text{quote}"
        case "list":
            if not isinstance(value, list): return "should be a list, eg. [a, b]"
            for item in value:
                problem = "is empty" if is_empty(item) else \
                    check_value({**field, "type": field.get("item", "text")}, item, statuses)
                if problem: return f"item {json.dumps(item, ensure_ascii=False)} {problem}"
            return None
        case "bool": return None if isinstance(value, bool) else "should be true or false"
        case "year":
            if not _is_int(value) or abs(value) > 9999: return "should be a year, eg. 1985"
            return "should not be 0 (there is no year 0)" if value == 0 else None
        case "count": return None if _is_int(value) and value >= 0 else "should be a whole number"
        case "series-number":
            return None if _is_number(value) and value >= 0 and abs(value * 10 - round(value * 10)) < 1e-9 \
                else "should be a number ≥ 0, eg. 3, 0 (a prequel), or 2.5 (between books)"
        case "number": return None if _is_number(value) and value >= 0 else "should be a number"
        case "partial-date":
            return None if is_str and _is_partial_date(value) \
                else f'should be a date, eg. 2024-06-28, "2024-05", or "2023"{quote}'
        case "rating":
            return None if _is_number(value) and 1 <= value <= 5 and float(value * 4).is_integer() \
                else "should be 1–5, in quarter steps"
        case "isbn":
            if not is_str: return f"should be an ISBN{quote}"
            if not re.fullmatch(r"\d{9}[\dX]|\d{13}", value): return "should be an ISBN-10 or ISBN-13, digits only"
            return None if _is_isbn(value) else "has a bad checksum"
        case "digits":
            return None if (_is_int(value) and value >= 0) or (is_str and re.fullmatch(r"\d+", value)) \
                else "should be a numeric id"
        case "attachment":
            return None if is_str and re.fullmatch(rf"attachments/{field['dir']}/[^/]+", value) \
                else f"should be a path in attachments/{field['dir']}/"
        case "enum":
            return None if value in field["values"] else f"should be one of: {', '.join(field['values'])}"
        case "status": return None if value in statuses else f"should be one of: {', '.join(statuses)}"
    if kind not in PATTERNS: return f'has unknown type "{kind}" in schema'
    pattern, message = PATTERNS[kind]
    if not is_str: return message + quote
    return None if re.fullmatch(pattern, value) and (kind != "date" or _is_partial_date(value)) else message


# patterns of slug styles
SLUGS = {
    "kebab": (KEBAB, "should be lowercase words & hyphens"),
    "citekey": (r"[A-Za-z][A-Za-z0-9_-]*", "should be a citation key"),
    "dated": (rf"\d{{4}}-\d{{2}}-\d{{2}}-{KEBAB}", "should be <date>-<lowercase words & hyphens>"),
}


def check_entry(schema: dict, name: str, slug: str, fields: dict) -> list[tuple[str, str]]:
    """Problems with note (by its slug & frontmatter) in collection, as (field or "slug", what is wrong)."""
    collection = schema["collections"][name]
    problems = []

    pattern, message = SLUGS[collection["slug"]["style"]]
    when = fields.get("date")
    if not re.fullmatch(pattern, slug): problems.append(("slug", f'"{slug}" {message}'))
    elif collection["slug"]["style"] == "dated" and isinstance(when, str) and not slug.startswith(f"{when}-"):
        problems.append(("slug", f'"{slug}" should start with its date, {when}'))

    statuses = list((collection.get("status") or {}).values())
    for key, value in fields.items():
        field = collection["fields"].get(key)
        if not field: problems.append((key, f"is not a field of {name}"))
        elif not is_empty(value) and (wrong := check_value(field, value, statuses)): problems.append((key, wrong))
    for key, field in collection["fields"].items():
        if field.get("required") and is_empty(fields.get(key)): problems.append((key, "is required"))
        if field.get("requires") and not is_empty(fields.get(key)) and is_empty(fields.get(field["requires"])):
            problems.append((key, f"needs {field['requires']} too"))

    # status must agree with dates & flags: its role may forbid some (eg. nothing in the backlog is started), which
    # must then be empty (or a flag, false)
    role = next((role for role, word in (collection.get("status") or {}).items() if word == fields.get("status")),
                None)
    for key in (schema["roles"].get(role) or {}).get("forbids", []):
        value = fields.get(key)
        if value is not False and not is_empty(value):
            problems.append((key, f"should be {'false' if value is True else 'empty'} while {fields['status']}"))
    started, finished = fields.get("started"), fields.get("finished")
    if isinstance(started, str) and isinstance(finished, str):
        length = min(len(started), len(finished))
        if started[:length] > finished[:length]: problems.append(("finished", "should not be before started"))
    return problems


def _js_string(value) -> str:
    """Value as JavaScript writes it in a string (eg. 8 for 8.0), so both validators' messages agree."""
    return str(int(value)) if isinstance(value, float) and value.is_integer() else str(value)


def read_frontmatter(text: str) -> dict | None:
    """Frontmatter of note, or None if it has none."""
    match = FRONTMATTER.match(text)
    return None if match is None else load(match[1]) or {}


def _template_keys(text: str) -> list[str]:
    """Top-level keys of template, in order (read as lines, since templates hold placeholders like {{date}})."""
    match = FRONTMATTER.match(text)
    return re.findall(r"^([\w-]+):", match[1] if match else "", re.M)


def validate_vault(content: Path = CONTENT) -> list[Problem]:
    """Problems with every note in vault, & its templates (as validateVault in scripts/validateContent.js)."""
    schema = load_schema(content)
    problems = []
    urls = {} # "<destination>/<slug>" → file

    for name, collection in schema["collections"].items():
        fields = list(collection["fields"])
        for template in collection["templates"]:
            file = f"Templates/{template}"
            path = content / file
            keys = _template_keys(path.read_text(encoding="utf-8")) if path.exists() else []
            missing, extra = [k for k in fields if k not in keys], [k for k in keys if k not in fields]
            if missing or extra:
                parts = ([f"lacks {', '.join(missing)}"] if missing else []) \
                    + ([f"has unknown {', '.join(extra)}"] if extra else [])
                problems.append(Problem(file, " & ".join(parts) + f" (fields of {name} in schema.yaml)"))

        folder = content / name
        if not folder.is_dir(): continue
        seen = [{} for _ in collection.get("unique", [])] # for each set of keys unique together: values → file
        for path in sorted(folder.glob("*.md")):
            file, slug = f"{name}/{path.name}", path.stem
            frontmatter = read_frontmatter(path.read_text(encoding="utf-8"))
            if frontmatter is None:
                problems.append(Problem(file, "has no frontmatter"))
                continue
            problems += [Problem(file, message, field) for field, message in
                         check_entry(schema, name, slug, frontmatter)]

            # attachments must exist
            for key, field in collection["fields"].items():
                if "attachment" not in (field["type"], field.get("item")): continue
                value = frontmatter.get(key)
                for target in value if isinstance(value, list) else [value]:
                    if isinstance(target, str) and target.startswith("attachments/") \
                            and not (content / target).exists():
                        problems.append(Problem(file, f"names {target}, which doesn't exist", key))

            # sets of keys unique together (eg. series & series-number) must be
            for keys, files in zip(collection.get("unique", []), seen):
                values = [frontmatter.get(key) for key in keys]
                if any(is_empty(value) for value in values): continue
                together = json.dumps(values)
                if together in files:
                    shown = " ".join(_js_string(value) for value in values)
                    problems.append(Problem(file, f"shares {shown} with {files[together]}", keys[-1]))
                else: files[together] = file

            # URLs (build/<destination>/<slug>.html) must be unique
            url = f"{collection.get('destination') or frontmatter.get('destination')}/{slug}"
            if url in urls: problems.append(Problem(file, f"clashes with {urls[url]} (both at {url})", "slug"))
            else: urls[url] = file

    for entry in sorted(content.iterdir()):
        if entry.is_dir() and not entry.name.startswith(".") and entry.name not in NOT_COLLECTIONS \
                and entry.name not in schema["collections"]:
            problems.append(Problem(entry.name, "is not a collection in schema.yaml"))
    return problems
