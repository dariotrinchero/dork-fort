# `dork`: design & progress

A TUI & CLI for adding & updating novels, nonfiction, films & games in the content vault. Two screens, **add**
& **update**, share a type-aware frontmatter editor; CLI shortcuts open each directly.

Principles: **parity** with the site's data model, **minimum friction**, **no API spamming**, **automatic
validation** (flag junk rather than autofill it).

## Progress

1. **Schema & parity**
   - [x] `content/schema.yaml`, covering every collection
   - [x] games collection: `Templates/Game.md`, `games/` (one placeholder), `Bases/Games.base`, `types.json`,
     `content.d.ts`
   - [x] build validates the vault against the schema (`scripts/validateContent.js`, also `npm run check`;
     blocks prod builds, warns in dev), & `bakeContent.js` takes its date fields from the schema
   - [x] shared test cases (`tests/validators.yaml`), run by `npm test` (also in CI, before the build) & by
     `python3 -m unittest discover tools/dork/tests`, which also runs both validators on a copy of the vault
     broken in every way they check, & insists they report the very same problems
   - [x] `dork check`, with the same rules as the build
2. **Vault & update** (fully useful offline)
   - [x] vault read/write (`vault.py`); line-preserving emitter (round-trip: every note in the vault renders
     back byte for byte, in the tests)
   - [x] fuzzy finder (`fuzzy.py`, checked against `src/fuzzy.ts` itself under Node), quick actions, star
     overlay, undo (of every change this session, last first)
   - [x] editor, incl. renaming (which rewrites wikilinks to the note across the vault)
   - [x] headless `start`/`finish`/`pause`/`dnf`/`rate`
   - [ ] try it for real for a while, & note what grates
3. **Add**
   - [ ] net layer (throttle, in-RAM cache, User-Agent)
   - [ ] Open Library → TMDB → Zotero/Crossref/arXiv → IGDB
   - [ ] optional cover/poster download on write
4. **Later:** `dork fill`; Zotero's connector (so an external hit gets a real citekey); undo across sessions;
   the site showing games.

---

## Parity

**`content/schema.yaml`** is read by both the build & `dork`. The templates still give field order & defaults
(and remain Obsidian's templates); the schema adds each field's type, allowed values, & what each status means.

- **Status roles.** `backlog`, `active`, `paused`, `done` & `dropped` are shared across media types. Each
  collection names them in its own words (`to-read`, `watching`, `played`, …). Quick keys, colours &
  date-stamping all work on roles.
- **The build validates against the schema.** It checks:
  - unknown keys, wrong types & malformed values;
  - status vs dates;
  - slugs, including clashes within a destination;
  - that each template's keys equal its schema's fields, in order.
- **Validators exist twice** (JS in `scripts/validateContent.js`, Python in `tools/dork/`). Both run the same
  cases in `tests/validators.yaml`. The shared layer only reports *errors* (what the build rejects); `dork`'s
  "suspicious value" warnings are its own.
- **Both sides parse YAML 1.2 (core schema).** The site's `yaml` package does, & `dork` uses a PyYAML loader
  restricted to match:
  - full dates stay strings;
  - `3:45` is not sexagesimal;
  - `yes`/`no` are not booleans.

  The shared cases include parsing cases too. One known gap: PyYAML (a YAML 1.1 parser underneath) rejects a
  `?` in an unquoted item of a flow list (`[http://a.com/?b]`), which `yaml` accepts; quote such items.
- **`dork`'s fuzzy matcher is a port of `src/fuzzy.ts`**, so it ranks as the site's shell does.
- **`dork` lives in `tools/dork/`**, a Python package (`tools/dork/dork/`) with a launcher,
  `tools/dork/bin/dork`, to symlink onto PATH (`ln -s "$PWD/tools/dork/bin/dork" ~/.local/bin/dork`). It finds
  the vault from its own real path (`DORK_CONTENT` overrides that). Its one dependency is PyYAML, beside the
  standard library's `curses`, `urllib`, `json` & `tomllib`. Keys & contact details live in
  `~/.config/dork/config.toml`.

## Data

- **Writing frontmatter is line-preserving.** Each top-level key's raw lines are kept, & only keys whose values
  changed are re-emitted. Re-emitted values follow the templates' style:
  - flow lists (`[a, b]`);
  - ISBNs & partial dates quoted, & anything YAML would otherwise mistype;
  - empty values bare (`rating:`).

  New keys go in template order, unknown keys are kept (but flagged), & the body is untouched. A file is only
  written if something changed.
- **Attachments are paths from the vault root**, as `gpx` already is: `cover: attachments/covers/<slug>.jpg`.
- **Games** (`games/`, moon-and-stars):
  - **fields:** `title, aliases, year, developer, platform, igdb, cover, status, started, finished, rating,
    owned, shortlist, recommended-by, tags`;
  - **`platform`:** what *you* played it on;
  - **status:** `to-play | playing | paused | played | dnf`;
  - **slug:** `<title>-<year>`.
- **IDs:**
  - `tmdb` is `movie/<id>` or `tv/<id>`, since TMDB's ids are per media type;
  - `igdb` is the game's slug, as in `igdb.com/games/<slug>`.

## Sources & API etiquette

| Type | Source | Key | Requests |
|---|---|---|---|
| novel | Open Library `search.json` | none | 1 per search |
| film / series / anime | TMDB `search/multi` | yes | 1 per search; credits only for the candidate opened |
| nonfiction | Zotero first (local API, or a copy of `zotero.sqlite`); then Crossref / arXiv / Open Library | none | 1 per source per search |
| game | IGDB `/v4/games` | Twitch client id/secret; token cached in `~/.cache/dork/` | 1 per search |

- **Zotero holds all nonfiction**, so a hit from it gives the filename (its `citationKey`; read it, never guess
  it), the metadata (its edition) & `kind` (its item type). Zotero locks its database while running, so read
  `~/Documents/Zotero/zotero.sqlite` through a copy, or else Zotero 7's local API (`localhost:23119/api/`) while
  it runs. Crossref, arXiv & Open Library are only for things not yet in Zotero; better to add them there first.
- **Explicit submit only.** A query typed on the command line counts as submitted.
- **Untyped `dork add "…"` fans out** to one request per source, & the results fill the type tabs with counts.
- **In-RAM caches.** Searches are cached by `(source, query)` & details by `(source, id)`, so going back to the
  candidates, switching tabs, or resubmitting the same query costs nothing.
- **Per-host throttling**, & a `User-Agent: dork/<version> (<contact>)` header.
- **Mapping prefers empty over junk.** It takes the first *valid* value, eg. the first ISBN-13 whose checksum
  passes. Invalid values arrive coloured as errors.
- **Cover downloads are optional, per entry.** The editor shows a `cover` row with the remote image & a
  download toggle (←/→), defaulting to `download-covers` in the config. When off, `cover` stays empty, &
  `dork fill` can fetch it later. Covers are only ever downloaded on write, at full size (the build resizes &
  dithers them).

## Screens

### Add

- **Layout.** Type tabs, a query line, & the top hits with distinguishing detail: author or director, year,
  ISBN, kind. Hits already in the vault are dimmed.
- **Picking a hit.** Enter opens the editor on the filled template.
- **Going back.** The editor's back key returns to the list exactly as it was, without a new request.

### Editor (shared by add & update)

- **The `file` row** is the slug. It follows title, author & year until edited by hand, & is checked for syntax
  & clashes.
- **Controls by field type:**

  | Field type | Controls |
  |---|---|
  | text | Enter edits inline (`^A ^E ^W ^U ^K`; Esc cancels) |
  | enum, status, bool | ←/→ cycle (Enter too), each value in its colour |
  | rating | ←/→ in quarter steps; digits set it; `0` clears it; Enter opens the star meter |
  | list | edited as `a, b, c` |
  | partial date | `t` sets today |
  | any | `x` (or Backspace) clears it; `u` undoes changes to it |

- **Pasted values are tidied:** a DOI's or arXiv's URL to its id, a TMDB page to `movie/<id>`, an IGDB page to
  its slug, & an ISBN to digits.
- **Status stamps dates.** Changing status applies the role's stamp: `active` stamps `started`, `done` stamps
  `finished`, each with today if empty. Cycling past a status undoes its stamp (so passing `reading` on the way
  to `read` leaves no `started`), unless the date was set by hand.
- **Colours.** Errors show red, warnings orange, & the footer gives the highlighted field's reason.
- **Keys.**

  | Key | Action |
  |---|---|
  | `w` | write (blocked while there are errors) |
  | `e` | write, then `$EDITOR` at the body |
  | Esc, `q` | back |
  | `u` | undo field |

  Leaving with unsaved changes asks first. After `$EDITOR` changes a note, undo no longer reaches back past it
  (undoing would discard what was written there).

### Update (fuzzy finder)

- **One list of all entries**, filtered live as you type.
  - Each row has a type tag coloured by collection, & its status in its role's colour.
  - Tab (⇧Tab back) cycles a filter by collection, in either mode.
  - Active & backlog entries win ties; with no query, what's in progress comes first, then what changed last.
  - Matching ignores accents ("jose" finds José).
- **Query mode** (the default): typing filters, & Ctrl acts on the highlighted match:

  | Key | Action |
  |---|---|
  | `^F` | finish |
  | `^S` | start |
  | `^P` | pause |
  | `^D` | dnf |
  | `^R` | rate |

  `^Z` undoes. Curses runs in `raw()` mode, so `^S` isn't flow control, & `^C` quits.
- **List mode:** ↓ moves into the list, & down a row (as ↓ always does).
  - Bare `f s p d r` act on the selected entry.
  - Enter or `e` edits.
  - `/`, Esc, or ↑ past the top, returns to the query; `q` quits; `?` lists the keys.
- **Feedback.** Every action writes immediately & reports what changed, eg.
  `novels/a-discovery-of-witches-harkness.md: to-read → read, finished 2026-10-26`. `u` undoes the last change.
  Actions refuse to leave an entry invalid (eg. pausing something with a `finished` date), saying why.

## Command line

```
dork                                update screen
dork <query>                        update screen, prefiltered
dork add [type] [query]             add screen; a query is searched at once
dork start|finish|pause|dnf <query> headless if there's a clear best match, else update screen with action armed
dork rate <query> [n]               likewise; without n, opens the star overlay
dork check                          validate the vault, as the build does
dork fill [collection]              later: backfill year/pages/cover (throttled)
```

Headless actions only consider entries the action can follow (finish & dnf: backlog, active or paused; start:
backlog, paused or dropped; pause: backlog or active), & only those the query matches *strongly*: every word of
it appearing as typed (accents aside), not scattered letter by letter (fuzzily, "dune" matches "Jury Duty"). A
**clear best match** among those is either the only one, one titled exactly the query, or one that outscores the
runner-up by half as much again. Otherwise the finder opens, prefiltered, with the action armed (or, without a
terminal, the candidates are listed).

## Verification

- **Tests.** `npm test` & `python3 -m unittest discover tools/dork/tests` both pass on `tests/validators.yaml`.
- **Parity.** `dork check` & `npm run build` report the same problems.
- **Round-trip.** Load & re-emit every entry without edits, & `git diff --stat content/` is empty.
- **Manual,** in a scratch copy of the vault (`DORK_CONTENT=…`):
  - `dork finish witches` is ambiguous, so the finder opens;
  - `dork finish "discovery of witches"` runs headless & prints its line;
  - `dork add novel "piranesi"`: pick a hit, go back & pick another (the `--debug` log shows no second
    request), enter a bad ISBN (it turns red & blocks `w`), & check that `e` opens `$EDITOR`;
  - `dork add film "after hours"` shows the hit as already in the vault.
