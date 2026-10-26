"""What dork does to entries: setting status by role (start, finish, pause, dnf) & rating, describing changes,
& finding the entry a query means."""

import unicodedata
from dataclasses import dataclass
from datetime import date

from .fuzzy import fuzzy_match
from .validate import check_entry, is_empty
from .vault import Changes, Entry, save, template_order

# quick actions, & the status role each sets
ACTIONS = {"start": "active", "finish": "done", "pause": "paused", "dnf": "dropped"}

# roles from which the command line takes each quick action to apply (eg. not finishing what's finished, or
# dropping it); in the finder, anything goes that leaves an entry valid
FROM = {"start": {"backlog", "paused", "dropped"}, "finish": {"backlog", "active", "paused"},
        "pause": {"backlog", "active"}, "dnf": {"backlog", "active", "paused"}}

# what each quick action makes of an entry, eg. "finished"
DONE = {"start": "started", "finish": "finished", "pause": "paused", "dnf": "dropped", "rate": "rated"}

# order of roles in which entries come, other things being equal (what's in progress first)
ROLE_ORDER = ["active", "backlog", "paused", "done", "dropped"]


def today() -> str: return date.today().isoformat()


def role_of(schema: dict, entry: Entry) -> str | None:
    """Status role of entry (eg. "done" for a novel that's "read")."""
    status = schema["collections"][entry.collection]["status"]
    return next((role for role, word in status.items() if word == entry.fields.get("status")), None)


def stars(rating) -> str:
    """Rating as five stars, filled in quarters, eg. "★★★★¾" for 4.75 (as the site draws it)."""
    whole = int(rating)
    quarters = round(4 * (rating - whole))
    return "★" * whole + ["", "¼", "½", "¾"][quarters] + "☆" * (5 - whole - (quarters > 0))


def creator(entry: Entry) -> str:
    """Who made it: author (or first of authors), director, or developer."""
    fields = entry.fields
    authors = fields.get("authors") or [None]
    return str(fields.get("author") or authors[0] or fields.get("director") or fields.get("developer") or "")


def with_role(schema: dict, entry: Entry, fields: dict, role: str, stamped: dict | None = None) -> dict:
    """Fields with status set to role's word, & the date field role stamps (if any) set to today if empty.
    Fields named in stamped first take those values (as before an earlier stamp, in the editor)."""
    new = {**fields, **(stamped or {}), "status": schema["collections"][entry.collection]["status"][role]}
    stamp = schema["roles"][role].get("stamps")
    if stamp and is_empty(new.get(stamp)): new[stamp] = today()
    return new


def describe(schema: dict, entry: Entry, old: dict, new: dict, slug: str | None = None) -> str:
    """What changed, eg. "novels/the-cave-saramago.md: to-read → read, finished 2026-10-26"."""
    def show(key, value) -> str:
        if is_empty(value): return "—"
        if key == "rating": return stars(value)
        return ", ".join(map(str, value)) if isinstance(value, list) else str(value)

    changes = []
    if slug and slug != entry.slug: changes.append(f"renamed {slug}.md")
    for key in [*old, *(k for k in new if k not in old)]:
        before, after = old.get(key), new.get(key)
        if before == after and type(before) is type(after): continue
        if key == "status": changes.append(f"{show(key, before)} → {show(key, after)}")
        elif is_empty(before): changes.append(f"{key} {show(key, after)}")
        elif is_empty(after): changes.append(f"{key} cleared")
        else: changes.append(f"{key} {show(key, before)} → {show(key, after)}")
    return f"{entry.file}: {', '.join(changes) or 'unchanged'}"


@dataclass
class Outcome:
    """What came of an action: what to say, whether it went wrong, & the files changed (to undo them)."""
    message: str
    failed: bool = False
    changes: Changes | None = None


def apply(schema: dict, entry: Entry, new: dict) -> Outcome:
    """Write entry with new fields, unless that would leave it with problems it didn't have."""
    collection = schema["collections"][entry.collection]
    before = set(check_entry(schema, entry.collection, entry.slug, entry.fields))
    problems = [p for p in check_entry(schema, entry.collection, entry.slug, new) if p not in before]
    if problems:
        field, message = problems[0]
        return Outcome(f"{entry.file}: not changed, as {field} {message}", failed=True)
    kinds = {key: field["type"] for key, field in collection["fields"].items()}
    changes = save(entry, new, template_order(schema, entry.collection), kinds)
    return Outcome(describe(schema, entry, entry.fields, new), changes=changes)


def act(schema: dict, entry: Entry, action: str, rating=None) -> Outcome:
    """Do quick action to entry: one of ACTIONS, or "rate" (to rating, or None to clear it)."""
    if action == "rate":
        if rating == entry.fields.get("rating"): return Outcome(f"{entry.file}: already rated that", failed=True)
        return apply(schema, entry, {**entry.fields, "rating": rating})
    role = ACTIONS[action]
    if role_of(schema, entry) == role:
        return Outcome(f"{entry.file}: already {entry.fields['status']}", failed=True)
    return apply(schema, entry, with_role(schema, entry, entry.fields, role))


#---- finding entries ------------------------------------------------------------------------------

def haystack(entry: Entry) -> str:
    """Text a query is matched against: title first (so its matches can be shown), then who made it."""
    return f"{entry.fields.get('title') or entry.slug}  {creator(entry)}"


def rank(schema: dict, entries: list[Entry], query: str) -> list[tuple[Entry, set[int], int]]:
    """Entries matching query, best first (ties going to what's in progress, then to the backlog), with the
    indices of their haystacks matched, & their scores."""
    order = {role: i for i, role in enumerate(ROLE_ORDER)}
    query = fold(query)
    scored = [(entry, *match) for entry in entries if (match := fuzzy_match(query, fold(haystack(entry))))]
    scored.sort(key=lambda m: (-m[2], order.get(role_of(schema, m[0]), len(order)),
                               str(m[0].fields.get("title") or m[0].slug).lower()))
    return scored


def fold(text: str) -> str:
    """Text without accents, character for character (so indices into it are indices into text): "José" gives
    "Jose"."""
    return "".join((unicodedata.normalize("NFKD", ch)[:1] or ch) for ch in text)


def strong(query: str, entry: Entry) -> bool:
    """Whether every word of query appears, as typed, in the entry's title or who made it (rather than scattered
    letter by letter, as fuzzy matching allows: "dune" fuzzily matches "Jury Duty")."""
    text = fold(haystack(entry)).lower()
    return all(word in text for word in fold(query).lower().split())


def clear_best(schema: dict, entries: list[Entry], query: str) -> Entry | None:
    """Entry query clearly means, if any, among those it matches strongly: the only one, or else one whose
    title is the query, or which outscores the runner-up by half as much again."""
    ranked = [(entry, score) for entry, _, score in rank(schema, entries, query) if strong(query, entry)]
    if len(ranked) == 1: return ranked[0][0]
    if not ranked: return None
    title = lambda entry: fold(str(entry.fields.get("title", ""))).lower()
    exact = [entry for entry, _ in ranked if title(entry) == fold(query.strip()).lower()]
    if len(exact) == 1: return exact[0]
    (best, top), (_, second) = ranked[:2]
    return best if top >= 1.5 * second else None


def applicable(schema: dict, entries: list[Entry], action: str) -> list[Entry]:
    """Entries the command line takes action to apply to (eg. only those not yet finished, for finish)."""
    if action not in FROM: return entries
    return [entry for entry in entries if role_of(schema, entry) in FROM[action]]
