"""The vault's schema (content/schema.yaml), shared with the build (scripts/validateContent.js)."""

import os
from pathlib import Path

from .yamlcore import load

# the vault: DORK_CONTENT, or else content/ in the repo holding dork (tools/dork/dork/ → content/)
CONTENT = Path(os.environ.get("DORK_CONTENT") or Path(__file__).resolve().parents[3] / "content")


def load_schema(content: Path = CONTENT) -> dict:
    """Read schema of vault, giving each collection the fields shared by those with a status, & a list of
    templates (as loadSchema in scripts/validateContent.js)."""
    schema = load((content / "schema.yaml").read_text(encoding="utf-8"))
    for collection in schema["collections"].values():
        if collection.get("status"): collection["fields"] = {**schema["tracked"], **collection["fields"]}
        template = collection["template"]
        collection["templates"] = template if isinstance(template, list) else [template]
    return schema
