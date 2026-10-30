"""Slugs (filenames, which are also URLs) made from notes' fields, by their collection's rule in the schema (eg.
"{title|short}-{author|surname}" gives "the-cave-saramago")."""

import re
import unicodedata

# words that belong to a surname when they come before it (as in Le Guin, or de Beauvoir); as in the site's
# surname() (src/moonAndStars.ts), so that both order authors alike
PARTICLES = {"le", "la", "de", "du", "des", "del", "della", "di", "da", "van", "von", "der", "den", "ter", "ten", "st",
             "st."}


def slugify(text: str) -> str:
    """Text as lowercase words joined by hyphens, without accents or apostrophes ("Howl's Moving Castle" gives
    "howls-moving-castle")."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    text = re.sub(r"['’‘`]", "", text.replace("&", " and "))
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def short(title: str) -> str:
    """Title without its subtitle ("Dune: Part Two" gives "Dune")."""
    return re.split(r":\s| - | — ", title, maxsplit=1)[0]


def surname(name: str) -> str:
    """Surname of a person, with any particles before it ("Ursula K. Le Guin" gives "Le Guin")."""
    words = name.split()
    i = len(words) - 1
    while i > 1 and words[i - 1].lower() in PARTICLES: i -= 1
    return " ".join(words[i:])


FILTERS = {"short": short, "surname": surname}


def make_slug(rule: str, fields: dict) -> str:
    """Slug made by rule from fields; parts whose fields are empty are left out."""
    def part(match: re.Match) -> str:
        key, *filters = match[1].split("|")
        value = fields.get(key)
        if isinstance(value, list): value = value[0] if value else None
        if value is None or value == "": return ""
        value = str(value)
        for name in filters: value = FILTERS[name](value)
        return slugify(value)

    return re.sub(r"-{2,}", "-", re.sub(r"\{([^}]+)\}", part, rule)).strip("-")
