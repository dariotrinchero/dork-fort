"""dork's requests, kept polite: each host is sent requests no faster than it asks (Open Library: one a second),
every response is kept in memory for the session (so nothing is fetched twice), & every request says who sends
it. Requests can be logged, one line each, to $DORK_LOG."""

import json
import os
import socket
import threading
import time
from http.client import HTTPSConnection
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPSHandler, Request, build_opener

from . import __version__
from .config import setting

AGENT = f"dork/{__version__} (+https://github.com/dariotrinchero/dork-fort)"

# least time between requests to each host, in seconds (the rest get DEFAULT_INTERVAL)
INTERVALS = {"openlibrary.org": 1.0, "covers.openlibrary.org": 0.5, "query.wikidata.org": 1.0}
DEFAULT_INTERVAL = 0.2
TIMEOUT = 20

_cache: dict[tuple, bytes] = {}
_last: dict[str, float] = {}
_lock = threading.Lock()


def _connect(address, timeout=socket.getdefaulttimeout(), source_address=None, **_):
    """socket.create_connection, but trying IPv4 addresses first: where IPv6 is routed but doesn't get through (as
    on some networks), urllib otherwise waits out the whole timeout on every request (curl races the two instead).
    As in cli-tools' twoey.py."""
    host, port = address
    problem: OSError = OSError(f"could not resolve {host}")
    for *_, where in sorted(socket.getaddrinfo(host, port, 0, socket.SOCK_STREAM),
                            key=lambda info: info[0] != socket.AF_INET):
        try: return socket.create_connection(where[:2], timeout, source_address)
        except OSError as exc: problem = exc
    raise problem


class _IPv4First(HTTPSConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = _connect # http.client sets this per connection, in __init__


class _IPv4FirstHandler(HTTPSHandler):
    def https_open(self, req): return self.do_open(_IPv4First, req, context=self._context)


_OPENER = build_opener(_IPv4FirstHandler)


def urlopen(request: Request, timeout: float):
    return _OPENER.open(request, timeout=timeout)


class NetError(Exception):
    """A request that failed, said briefly (eg. "openlibrary.org: timed out")."""


def agent() -> str:
    contact = setting("contact", default="")
    return f"{AGENT[:-1]}; {contact})" if contact else AGENT


def _log(line: str):
    if path := os.environ.get("DORK_LOG"):
        with open(path, "a", encoding="utf-8") as log: log.write(f"{time.strftime('%H:%M:%S')} {line}\n")


def _wait(host: str):
    """Hold this request until host's interval since its last one has passed."""
    interval = INTERVALS.get(host, DEFAULT_INTERVAL)
    with _lock:
        now = time.monotonic()
        start = max(now, _last.get(host, 0) + interval)
        _last[host] = start
    if start > now: time.sleep(start - now)


def fetch(url: str, headers: dict | None = None, data: bytes | None = None, cache: bool = True) -> bytes:
    """Body of response to GET (or, with data, POST) of url; the same request is only sent once a session."""
    key = (url, data, tuple(sorted((headers or {}).items())))
    if cache and key in _cache: return _cache[key]
    host = urlsplit(url).hostname or ""
    _wait(host)
    request = Request(url, data=data, headers={"User-Agent": agent(), **(headers or {})})
    try:
        with urlopen(request, timeout=TIMEOUT) as response: body = response.read()
    except HTTPError as exc:
        _log(f"{request.get_method()} {url} → {exc.code}")
        raise NetError(f"{host}: {exc.code} {exc.reason}") from None
    except (URLError, TimeoutError, OSError) as exc:
        _log(f"{request.get_method()} {url} → {exc}")
        reason = getattr(exc, "reason", exc)
        raise NetError(f"{host}: {'timed out' if isinstance(reason, TimeoutError) else reason}") from None
    _log(f"{request.get_method()} {url} → {len(body)} bytes")
    if cache: _cache[key] = body
    return body


def fetch_json(url: str, headers: dict | None = None, data: bytes | None = None):
    try: return json.loads(fetch(url, headers, data))
    except json.JSONDecodeError: raise NetError(f"{urlsplit(url).hostname}: not JSON") from None
