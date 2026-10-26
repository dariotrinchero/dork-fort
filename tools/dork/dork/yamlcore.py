"""A PyYAML loader reading YAML 1.2's core schema, as the site's `yaml` package does, so dork & the build read
notes alike: dates stay text, "3:45" isn't sexagesimal, yes/no aren't booleans, & "<<" isn't a merge key (see the
parsing cases in tests/validators.yaml)."""

import math
import re

import yaml

# implicit resolvers of YAML 1.1 that YAML 1.2's core schema reads differently, or not at all
_DROPPED = {"tag:yaml.org,2002:bool", "tag:yaml.org,2002:int", "tag:yaml.org,2002:float",
            "tag:yaml.org,2002:timestamp", "tag:yaml.org,2002:merge", "tag:yaml.org,2002:value"}


class Loader(yaml.SafeLoader):
    pass


Loader.yaml_implicit_resolvers = {
    first: [(tag, regex) for tag, regex in resolvers if tag not in _DROPPED]
    for first, resolvers in yaml.SafeLoader.yaml_implicit_resolvers.items()}

# core schema's resolvers; int before float, as "12" matches both
for tag, pattern, firsts in (
        ("bool", r"^(?:true|True|TRUE|false|False|FALSE)$", "tTfF"),
        ("int", r"^(?:[-+]?[0-9]+|0o[0-7]+|0x[0-9a-fA-F]+)$", "-+0123456789"),
        ("float", r"^(?:[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?"
                  r"|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$", "-+0123456789.")):
    Loader.add_implicit_resolver(f"tag:yaml.org,2002:{tag}", re.compile(pattern), list(firsts))


def _int(loader, node) -> int:
    text = loader.construct_scalar(node)
    if text.startswith("0o"): return int(text[2:], 8)
    if text.startswith("0x"): return int(text[2:], 16)
    return int(text) # leading zeros are decimal, unlike YAML 1.1's octal


def _float(loader, node) -> float:
    text = loader.construct_scalar(node).lower()
    if text.endswith(".inf"): return -math.inf if text.startswith("-") else math.inf
    if text == ".nan": return math.nan
    return float(text)


Loader.add_constructor("tag:yaml.org,2002:int", _int)
Loader.add_constructor("tag:yaml.org,2002:float", _float)


def load(text: str):
    """Read YAML document, as the site's `yaml` package would."""
    return yaml.load(text, Loader=Loader)
