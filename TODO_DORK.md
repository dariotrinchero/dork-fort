# `dork`: progress & plans

A TUI & CLI for adding & updating novels, nonfiction, films & games in the content vault. What's built is
specified in [tools/dork/README.md](tools/dork/README.md) (usage, parity with the site, behaviour, code &
testing); this file tracks progress, & plans what isn't built yet.

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
   - [ ] `~/.config/dork/config.toml` (keys, contact for `User-Agent`, `download-covers`), read with `tomllib`,
     which raises dork's minimum Python from 3.10 to 3.11
   - [ ] spec it in `tools/dork/README.md`, & trim it from here
4. **Later:** `dork fill`; Zotero's connector (so an external hit gets a real citekey); undo across sessions;
   the site showing games.

---

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

### Editor, for new entries

- **The `file` row follows the fields** (by the schema's `slug.from` rule) until edited by hand; this is built
  (`Editor.follow`), awaiting the add screen.
- **The cover row** shows the remote image's URL & the download toggle (above).
- **dork's own warnings** (orange): values that pass validation but look like junk from an API, eg. a year in
  the future, an ALL-CAPS title, an author "Unknown", 0 pages.

## Command line, to come

```
dork add [type] [query]             add screen; a query is searched at once
dork fill [collection]              backfill year/pages/cover from ISBNs & ids (throttled, resumable)
```

## Verification of add

- **Manual,** in a scratch copy of the vault (`DORK_CONTENT=…`):
  - `dork add novel "piranesi"`: pick a hit, go back & pick another (the `--debug` log shows no second
    request), enter a bad ISBN (it turns red & blocks `w`), & check that `e` opens `$EDITOR`;
  - `dork add film "after hours"` shows the hit as already in the vault.
