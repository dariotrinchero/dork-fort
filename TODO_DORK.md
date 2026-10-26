# `dork`: progress & plans

A TUI & CLI for adding & updating novels, nonfiction, films, games & board games in the content vault. What's
built is specified in [tools/dork/README.md](tools/dork/README.md) (usage, parity with the site, behaviour, code &
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
   - [x] request layer (`net.py`: throttled per host, cached for the session, identified, logged to `$DORK_LOG`)
   - [x] `~/.config/dork/config.toml`, read with `tomllib` (so dork now needs Python 3.11+)
   - [x] sources: Open Library (with a guessed edition, flagged, & any other pickable with `p`), Zotero
     (read-only, from disk, as you type), Wikidata (films, series & anime, & games; & novels' series), chosen
     for their terms (TMDB's & IGDB's, first built, were dropped: see "Sources" in the README)
   - [x] the add screen (`dork add`, `^A`/`a` from the finder, `^U` back, & `^T` between the two); the editor
     for new entries (slugs that follow the fields, warnings in orange, an optional cover download, undoable with
     the note)
   - [x] novels' `series` & `series-number`, validated (a number needs a series; no two novels share both), &
     sorting an author's series in order, in dork & on the site
   - [x] requests try IPv4 first (IPv6 timed out on every request, making each take 20 s)
   - [x] specified in `tools/dork/README.md`
   - [ ] set `contact` (an email) in `~/.config/dork/config.toml`, as Open Library asks
   - [ ] try adding for real for a while, & note what grates
4. **Board games**
   - [x] `boardgames/` (`Templates/Board Game.md`, `Bases/Board Games.base`, `types.json`, `content.d.ts`):
     `designer`, `players` (eg. "2–4"), & `bgg` (BoardGameGeek's id)
   - [x] only `to-play` or `played` (they're played again & again), with `first-played` rather than `started` &
     `finished` (roles stamp & forbid only the dates a collection has)
   - [x] `owned`: `true`, `false` or `wishlist` (for novels, nonfiction & games too), so wanting to buy something
     doesn't take `shortlist`, which says what's next to begin
   - [x] Wikidata source: the search box, & full text among items with a BoardGameGeek id (for names like "Root")
   - [ ] maybe, from Wikidata: playing time (P2047, with its unit), minimum age, & expansions (as their own entries,
     or a `kind`)
5. **Later**
   - [ ] `dork fill [collection]`: backfill `year`, `pages`, `cover`, `series` & `series-number` of entries that
     have an ISBN (by Open Library's edition, & its work's Wikidata series), & films' & games' fields from
     Wikidata (by their TMDB or IGDB id, or title & year); throttled, resumable, & showing each change for a yes
     or no (the imported novels have ISBNs, but no year, pages, cover or series)
   - [ ] the site showing games, board games (& films) on moon & stars
   - [ ] when the site shows covers (downloaded from Open Library, & dithered), a courtesy link to Open Library on
     it (eg. in each window's footer, or on whoami), as it asks of those who don't show covers from its server

## Decided against

- Saving to Zotero (eg. through its connector, for nonfiction not yet there): dork never touches the Zotero library.
- Undo across sessions: that's what git is for.
- Hiding spoilers in dork's reviews: the site will note that reviews may hold spoilers.
