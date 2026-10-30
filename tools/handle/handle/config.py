"""handle's settings, from ~/.config/handle/config.toml (or $HANDLE_CONFIG), none of which are needed:

    download-covers = true          # whether the editor's cover toggle starts on, for new entries
    contact = ""                    # added to the User-Agent of requests: Open Library asks for an email

    [zotero]
    data-dir = "~/Zotero"           # where zotero.sqlite is (by default, ~/Zotero or ~/Documents/Zotero)
"""

import os
import tomllib
from functools import lru_cache
from pathlib import Path

PATH = Path(os.environ.get("HANDLE_CONFIG") or "~/.config/handle/config.toml").expanduser()
CACHE = Path(os.environ.get("XDG_CACHE_HOME") or "~/.cache").expanduser() / "handle"


@lru_cache(maxsize=1)
def config() -> dict:
    """Settings, or none if there is no config file (a broken one raises, naming itself)."""
    if not PATH.exists(): return {}
    try:
        with PATH.open("rb") as file: return tomllib.load(file)
    except tomllib.TOMLDecodeError as exc: raise SystemExit(f"hdl: {PATH}: {exc}") from None


def setting(*keys: str, default=None):
    """Setting at keys (eg. "zotero", "data-dir"), or default."""
    value = config()
    for key in keys:
        if not isinstance(value, dict) or key not in value: return default
        value = value[key]
    return value
