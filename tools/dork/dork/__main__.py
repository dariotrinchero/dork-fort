"""dork's command line (see tools/dork/README.md):

    dork [query]                         the update screen (prefiltered by query)
    dork add [collection] [query]        the add screen (searching for query at once, if given; collection is novel,
                                         nonfiction, film, game or board, & if not given, every one is searched)
    dork start|finish|pause|dnf <query>  set the status of the entry query clearly means, else pick in the finder
    dork rate <query> [rating]           likewise, rating it (0 to clear; without a rating, the star meter opens)
    dork check                           validate the vault, as the build does
"""

import re
import sys

from . import __version__
from .actions import ACTIONS, DONE, act, applicable, clear_best, rank
from .schema import CONTENT, load_schema
from .validate import check_value, validate_vault
from .vault import load_entries, tracked

QUICK = [*ACTIONS, "rate"]

# words naming collections on the command line
COLLECTIONS = {"novel": "novels", "novels": "novels", "fiction": "novels",
               "nonfiction": "nonfiction", "nonfic": "nonfiction", "paper": "nonfiction", "papers": "nonfiction",
               "textbook": "nonfiction", "textbooks": "nonfiction",
               "film": "films", "films": "films", "movie": "films", "movies": "films", "series": "films",
               "tv": "films", "anime": "films", "game": "games", "games": "games",
               "board": "boardgames", "boardgame": "boardgames", "boardgames": "boardgames", "tabletop": "boardgames"}
COMMANDS = ["check", "add", *QUICK]


def check() -> int:
    """Validate vault, as the build does; exit with failure if anything is wrong."""
    problems = validate_vault()
    for problem in problems: print(f"{CONTENT.name}/{problem}", file=sys.stderr)
    print(f"✘ {len(problems)} problem{'s' * (len(problems) != 1)} in content" if problems else "✔ Content is valid")
    return 1 if problems else 0


def interactive() -> bool: return sys.stdin.isatty() and sys.stdout.isatty()


def finder(query: str = "") -> int:
    if not interactive(): return fail("dork's update screen needs an interactive terminal")
    from .tui.app import start
    from .tui.finder import Finder
    result = start(load_schema(), Finder(query))
    if result: print(result)
    return 0


def add(words: list[str]) -> int:
    """The add screen, searching at once for the query given (in the collection given first, if one is)."""
    if not interactive(): return fail("dork's add screen needs an interactive terminal")
    collection = COLLECTIONS.get(words[0].lower()) if words else None
    query = " ".join(words[1:] if collection else words)
    from .tui.add import Add
    from .tui.app import start
    result = start(load_schema(), Add(query, collection, search=True))
    if result: print(result)
    return 0


def quick(action: str, words: list[str]) -> int:
    """Do action to the entry the query clearly means; else let the finder pick it, with the action armed."""
    rating = None
    if action == "rate" and len(words) > 1 and re.fullmatch(r"\d+(?:\.\d+)?", words[-1]):
        rating = float(words.pop())
        rating = None if rating == 0 else int(rating) if rating.is_integer() else rating
        if rating is not None and (problem := check_value({"type": "rating"}, rating)):
            return fail(f"rating {problem}")
    query = " ".join(words).strip()
    if not query: return fail(f"usage: dork {action} <query>{' [rating]' if action == 'rate' else ''}")

    schema = load_schema()
    entries = load_entries(schema, tracked(schema))
    pool = applicable(schema, entries, action)
    best = clear_best(schema, pool, query)
    if best and (action != "rate" or rating is not None):
        outcome = act(schema, best, action, rating)
        print(outcome.message, file=sys.stderr if outcome.failed else sys.stdout)
        return 1 if outcome.failed else 0

    ranked = rank(schema, pool, query)
    if not ranked:
        could = f" that could be {DONE[action]}" if action in ACTIONS else ""
        return fail(f'nothing matches "{query}"{could}')
    if not interactive():
        print(f'"{query}" could mean any of:', file=sys.stderr)
        for entry, _, _ in ranked[:8]: print(f"  {entry.file}", file=sys.stderr)
        return 1

    from .tui.app import start
    from .tui.base import Stars
    from .tui.finder import Finder
    screen = Finder(query, armed=action, rating=rating)
    meter = None
    if best: # rate, with no rating given: the star meter, over the finder
        title = str(best.fields.get("title") or best.slug)
        meter = Stars(title, best.fields.get("rating"), lambda value: screen.done(act(schema, best, "rate", value)))
    result = start(schema, screen, meter)
    if result: print(result)
    return 0


def fail(message: str) -> int:
    print(f"dork: {message}", file=sys.stderr)
    return 1


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if not args: return finder()
    command, rest = args[0], args[1:]
    if command in ("-h", "--help", "help"):
        print(__doc__.strip())
        return 0
    if command == "--version":
        print(f"dork {__version__}")
        return 0
    if command == "check": return check()
    if command == "add": return add(rest)
    if command in QUICK: return quick(command, rest)
    return finder(" ".join(args))


if __name__ == "__main__":
    try: sys.exit(main())
    except KeyboardInterrupt: sys.exit(130)
