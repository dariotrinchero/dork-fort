"""What handle does to entries: setting status by role (start, finish, pause, dnf) & rating, describing changes,
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
FROM = {"start": {"backlog", "paused", "dropped"}, "finish": {"backlog", "active", "paused", "ongoing"},
        "pause": {"backlog", "active"}, "dnf": {"backlog", "active", "paused", "ongoing"}}

# what each quick action makes of an entry, eg. "finished"
DONE = {"start": "started", "finish": "finished", "pause": "paused", "dnf": "dropped", "rate": "rated"}

# order of roles in which entries come, other things being equal (what's in progress first)
ROLE_ORDER = ["active", "backlog", "paused", "ongoing", "done", "dropped"]

# orders to browse entries in (the finder's o cycles them): by status; best rated first; & by who made them, across
# collections. They're handle's own: the site orders its lists as suits each one
ORDERS = ["status", "rating", "creator"]


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


def stamp_of(schema: dict, collection: str, role: str) -> str | None:
    """Date field role stamps in collection, if any (eg. finished, or a board game's first-played)."""
    fields = schema["collections"][collection]["fields"]
    return next((key for key in schema["roles"].get(role, {}).get("stamps", []) if key in fields), None)


def creator(entry: Entry) -> str:
    """Who made it: author (or first of authors), director, developer, or designer."""
    fields = entry.fields
    authors = fields.get("authors") or [None]
    return str(fields.get("author") or authors[0] or fields.get("director") or fields.get("developer")
               or fields.get("designer") or "")


def with_role(schema: dict, entry: Entry, fields: dict, role: str, stamped: dict | None = None) -> dict:
    """Fields with status set to role's word, the date field role stamps (if any) set to today if empty, & flags
    role forbids turned off (eg. shortlist, once begun; dates it forbids are kept, for validation to refuse).
    Fields named in stamped first take those values (as before an earlier change, in the editor)."""
    new = {**fields, **(stamped or {}), "status": schema["collections"][entry.collection]["status"][role]}
    stamp = stamp_of(schema, entry.collection, role)
    if stamp and is_empty(new.get(stamp)): new[stamp] = today()
    for key in schema["roles"][role].get("forbids", []):
        if new.get(key) is True: new[key] = False
    return new


def describe(schema: dict, entry: Entry, old: dict, new: dict, slug: str | None = None) -> str:
    """What changed, eg. "novels/the-cave-saramago.md: to-read → read, finished 2026-10-26"."""
    def show(key, value) -> str:
        if is_empty(value): return "—"
        if key == "rating": return stars(value)
        if isinstance(value, bool): return str(value).lower() # as YAML has it
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
    if role not in schema["collections"][entry.collection]["status"]:
        return Outcome(f"{entry.file}: {entry.collection} can't be {DONE[action]}", failed=True)
    if role_of(schema, entry) == role:
        return Outcome(f"{entry.file}: already {entry.fields['status']}", failed=True)
    return apply(schema, entry, with_role(schema, entry, entry.fields, role))


#---- finding entries ------------------------------------------------------------------------------

def _sortable(text) -> str: return fold(str(text)).casefold()


def _newest(date: str) -> tuple:
    """Key sorting dates (as precise as known) newest first; a date counts as later than any less precise date
    it falls within ("2023-05" before "2023")."""
    return (*(-ord(ch) for ch in date), 1)


def _by_name(schema: dict, entry: Entry, latest_first: bool = False) -> tuple:
    """Key sorting entries of a collection by name: by kind (in the schema's order), where the collection has
    kinds; then by surname of the author (or first of the authors), where it has authors; then by series (or a
    book outside one, by its title) & number in it (with latest_first, highest first, as a newest-first timeline
    has a series read in order), where it has series; then by title."""
    from .slugs import surname
    fields, values = schema["collections"][entry.collection]["fields"], entry.fields
    key: list = []
    if fields.get("kind", {}).get("type") == "enum":
        kinds = fields["kind"]["values"]
        key.append(kinds.index(values.get("kind")) if values.get("kind") in kinds else len(kinds))
    if "author" in fields or "authors" in fields:
        who = str(values.get("author") or (values.get("authors") or [""])[0] or "")
        key.append((not who, _sortable(surname(who)) if who else "", _sortable(who)))
    title = _sortable(values.get("title") or entry.slug)
    if "series" in fields:
        number = values.get("series-number")
        number = number if isinstance(number, (int, float)) and not isinstance(number, bool) else -1
        key.append((_sortable(values["series"]) if values.get("series") else title,
                    -number if latest_first else number))
    return (*key, title)


def _by_creator(schema: dict, entry: Entry) -> tuple:
    """Key sorting entries by who made them, across collections: by surname (or a studio's whole name; those with
    no one known last), then by name (see _by_name, without kinds or authors), then by collection."""
    from .slugs import surname
    who, values = creator(entry), entry.fields
    person = who and not (values.get("developer") and who == str(values["developer"])) # studios have no surnames
    title = _sortable(values.get("title") or entry.slug)
    number = values.get("series-number")
    number = number if isinstance(number, (int, float)) and not isinstance(number, bool) else -1
    return (not who, _sortable(surname(who) if person else who), _sortable(who),
            _sortable(values["series"]) if values.get("series") else title, number, title,
            list(schema["collections"]).index(entry.collection))


def browse_order(schema: dict, entries: list[Entry], by: str = "status") -> list[Entry]:
    """Entries in the order to browse them (with no query), by one of ORDERS: by status (below); by rating, best
    first (unrated last), & then by status; or by who made them (see _by_creator).

    By status, entries go by status role (in progress, the backlog, paused,
    done, dropped), & within each:

    - done: by date finished (or first played), newest first (undated last), & within a date, a series' latest
      first;
    - active: by date started, newest first;
    - backlog & paused: shortlisted first;

    & then by collection (in the schema's order) & by name within it (see _by_name). Dates order entries across
    collections, so that what's done reads as one timeline."""
    roles = {role: i for i, role in enumerate(ROLE_ORDER)}
    names = list(schema["collections"])

    def key(entry: Entry) -> tuple:
        role, values = role_of(schema, entry), entry.fields
        first: tuple = ()
        if role in ("done", "active"):
            date = values.get(stamp_of(schema, entry.collection, role) or "")
            first = (is_empty(date), _newest("" if is_empty(date) else str(date)))
        elif role in ("backlog", "paused"): first = (not values.get("shortlist"),)
        return roles.get(role, len(roles)), first, names.index(entry.collection), \
            _by_name(schema, entry, latest_first=role == "done")

    if by == "creator": return sorted(entries, key=lambda entry: _by_creator(schema, entry))
    if by == "rating":
        def rated(entry: Entry) -> tuple:
            rating = entry.fields.get("rating")
            rating = rating if isinstance(rating, (int, float)) and not isinstance(rating, bool) else None
            return rating is None, -(rating or 0), key(entry)
        return sorted(entries, key=rated)
    return sorted(entries, key=key)


def haystack(entry: Entry) -> str:
    """Text a query is matched against: title first (so its matches can be shown), then who made it."""
    return f"{entry.fields.get('title') or entry.slug}  {creator(entry)}"


def rank(schema: dict, entries: list[Entry], query: str, by: str = "status") -> list[tuple[Entry, set[int], int]]:
    """Entries matching query, best first (ties going as browse_order has them, by by, eg. a series in order), with
    the indices of their haystacks matched, & their scores."""
    query = fold(query)
    scored = [(entry, *match) for entry in entries if (match := fuzzy_match(query, fold(haystack(entry))))]
    position = {id(entry): i for i, entry in enumerate(browse_order(schema, [m[0] for m in scored], by))}
    scored.sort(key=lambda m: (-m[2], position[id(m[0])]))
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
    """Entries the command line takes action to apply to (eg. only those not yet finished, for finish, & not board
    games, for pause)."""
    if action not in FROM: return entries
    return [entry for entry in entries if role_of(schema, entry) in FROM[action]
            and ACTIONS[action] in schema["collections"][entry.collection]["status"]]
