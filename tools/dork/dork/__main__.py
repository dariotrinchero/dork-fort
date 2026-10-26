"""dork's command line (see TODO_DORK.md)."""

import argparse
import sys

from . import __version__
from .schema import CONTENT
from .validate import validate_vault


def check() -> int:
    """Validate vault, as the build does; exit with failure if anything is wrong."""
    problems = validate_vault()
    for problem in problems: print(f"{CONTENT.name}/{problem}", file=sys.stderr)
    print(f"✘ {len(problems)} problem{'s' * (len(problems) != 1)} in content" if problems else "✔ Content is valid")
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="dork", description="Add & update media in the content vault.")
    parser.add_argument("--version", action="version", version=f"dork {__version__}")
    commands = parser.add_subparsers(dest="command", metavar="command")
    commands.add_parser("check", help="validate the vault, as the build does")
    args = parser.parse_args(argv)

    if args.command == "check": return check()
    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
