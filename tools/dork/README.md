# dork

A terminal tool for keeping track of novels, nonfiction, films & games in the site's content vault
(`content/`): adding them (from Open Library, Zotero & Wikidata), finding them, marking them started, finished,
paused or dropped, rating them, & editing their frontmatter, with every value checked by the same rules as the
site's build.

This README is dork's spec: what it does, & the rules that keep it in step with the site. What is still to be
built (`dork fill`, & more) is planned in [TODO_DORK.md](../../TODO_DORK.md).

## Setup

Needs Python 3.11+ & PyYAML (`python3-yaml` on Debian & Ubuntu), & nothing else. Put the launcher on PATH:

```bash
ln -s "$PWD/tools/dork/bin/dork" ~/.local/bin/dork
```

The launcher finds its package, & through it the vault (`content/` in this repo), from its own real path, so it
works from anywhere. `DORK_CONTENT=<path>` points it at another vault instead (eg. a scratch copy, for trying
things out).

Settings live in `~/.config/dork/config.toml` (or `$DORK_CONFIG`). None are needed: no source needs a key or an
account. Setting `contact` is good manners, though, as Open Library asks for an email in each request's
User-Agent:

```toml
download-covers = true    # whether the editor's cover toggle starts on, for new entries
contact = "you@example.org"  # added to requests' User-Agent (the repo's URL is always sent)

[zotero]
data-dir = "~/Zotero"     # where zotero.sqlite is (by default, ~/Zotero or ~/Documents/Zotero)
```

## Usage

### Command line

| Command | Does |
|---|---|
| `dork` | opens the finder |
| `dork <query>` | opens the finder, prefiltered by query |
| `dork add [collection] [query]` | opens the add screen, searching for query at once if given; collection (`novel`, `nonfiction`, `film` or `game`, or eg. `paper`, `movie`, `anime`) picks its tab, & otherwise every tab is searched |
| `dork finish <query>` | marks the entry the query clearly means as finished (read, watched, played), dated today; if it isn't clear which, opens the finder with the action armed |
| `dork start <query>` | likewise, as started (dated today) |
| `dork pause <query>` | likewise, as paused |
| `dork dnf <query>` | likewise, as dropped |
| `dork rate <query> [n]` | rates it `n` (1–5 in quarter steps, or 0 for no rating); without `n`, opens the star meter |
| `dork check` | validates the whole vault, as the build does; exits with failure if anything is wrong |

Each action prints one line saying what changed, eg.
`novels/a-discovery-of-witches-harkness.md: to-read → read, finished 2026-10-26`. An action that would leave an
entry invalid (eg. pausing something that has a `finished` date) changes nothing, & says why.

### The finder

Every entry of every collection with a status, filtered as you type. Each row shows the collection (or the
entry's kind, if its collection has kinds: film, series, anime; textbook, book, paper), in the collection's
colour, the title & who made it (with the characters the query matched highlighted), year, status (in its
colour) & rating.

**Typing** (the default) filters the list. Ctrl+letter acts on the highlighted entry:

| Key | Does |
|---|---|
| `^F` `^S` `^P` `^D` | finish, start, pause, or drop it (dates as above) |
| `^R` | rate it, in the star meter (↑/↓ by quarter stars, `1`–`5` whole stars, `0` none, Enter to save) |
| `^Z` | undo the last change |
| `^N` | add something new, searching for the query (in the collection filtered by, if any) |
| `^T` | to the add screen, as it was left, taking the query (without searching) |
| Enter | edit it |
| Tab, ⇧Tab | cycle a filter by collection |
| ↓ | into the list (& down a row) |
| Esc | clear the query; with no query, quit |

**In the list**, the same actions take bare letters: `f s p d r`, with `u` to undo, `a` to add, & `e` (or
Enter) to edit.
↑/↓ or `j`/`k` move, PgUp/PgDn page, `g`/`G` go to the top or bottom, ←/→ (or `h`/`l`) switch collection,
Space, `/`, Esc, or ↑ from the top row go back to typing, `?` lists the keys, & `q` quits.

Every change is written at once, & reported in the footer. Undo goes back through every change of the session,
last first.

When opened by a command-line action (eg. `dork finish witches`, if more than one entry could be meant), the
finder has that action **armed**: Enter does it to the highlighted entry, & dork then exits, printing what
changed.

### The add screen

A tab for each collection, each with its source:

| Tab | Source | Searched |
|---|---|---|
| novels | Open Library (& Wikidata, for series) | on Enter |
| nonfiction | your Zotero library (read from disk) | as you type |
| films | Wikidata (films, series & anime) | on Enter |
| games | Wikidata | on Enter |

Type a query & press Enter: the current tab is searched, or every tab if dork wasn't given a collection (so
`dork add piranesi` searches each source once). Each tab shows its count of hits (or a spinner, while searching);
tabs only change when you change them. Enter again opens the top hit; or ↓ into the list, & Enter (or `e`) on any
hit. Tab (or ←/→ in the list) switches tab, `^Z` (or `u` in the list) undoes, `^T` goes to the finder (taking the
query), & Esc clears the query, then goes back (to the finder, if it has been open).

Each hit shows its title, who made it, its year, & what tells it apart (eg. "23 editions", "1985 film by Martin
Scorsese", a citation key). Hits already in the vault are ticked & dimmed, & open the entry there instead.

Opening a hit fills in a new entry from its collection's template, & opens it in the editor (below). Writing it
returns to the hits, as they were. Opening a novel takes two more requests, made at once & only for the hit
opened: its editions (Open Library) & its series (Wikidata). Meanwhile the hit's row & the footer show a spinner,
& Esc cancels. Films & games need nothing more.

### The editor

A row per field of the entry, in its template's order, & one for its filename. Values the build would reject show
in red, with the reason in the footer when highlighted, & block writing. Values that pass, but look wrong (a year
in the future, a title in capitals, an author "Unknown", 0 pages, a date before the entry's year), show in orange,
& don't.

| Field type | Controls |
|---|---|
| status, kinds & other choices, true/false | ←/→ cycle through the values (each status in its colour) |
| rating | ←/→ step by quarter stars, `1`–`5` set whole stars, `0` clears; Enter opens the star meter |
| dates | `t` sets today |
| everything else | Enter edits the value inline (←/→, Home/End, `^A` `^E`, `^W` deletes a word, `^U` & `^K` the rest before or after the cursor; Enter keeps the edit, Esc drops it); lists are typed as `a, b, c`, with any item holding a comma in double quotes (as in CSV: `"I Hate People, People Hate Me", Jury Duty`) |
| any | `x` (or Backspace) clears it; `u` undoes changes to it |

Typed values are tidied: ISBNs lose hyphens & spaces, a DOI's or arXiv URL becomes its id, a TMDB page becomes
`movie/<id>` (or `tv/<id>`), & an IGDB page becomes the game's slug.

`w` writes the entry, & `e` writes it & then opens `$EDITOR` (or `$VISUAL`) at its first line after the
frontmatter, to write a review. Esc or `q` goes back, asking first if there are unsaved changes.

Editing the **filename** row renames the note on writing, & rewrites wikilinks to it (`[[old-slug|…]]`,
`[[old-slug#…]]`) across the vault, as renaming in Obsidian does.

**New entries** (from the add screen) differ in three ways:
- The filename follows the fields, by the collection's slug rule (eg. `{title|short}-{author|surname}`), until you
  edit it. For nonfiction, it is the item's citation key in Zotero.
- Values the source guessed show in **orange**, with the reason in the footer (eg. a guessed edition). They don't
  block writing, & editing a field clears its warning.
- The cover row offers a novel's cover: ←/→ toggle whether it's downloaded on writing (the setting
  `download-covers` gives the default). It is saved as `attachments/covers/<slug>.jpg`, & undo removes it with the
  note. (Wikidata has no posters or covers, which are copyrighted, so films & games come without.)
- For a novel, `p` lists the editions fetched (every one with an ISBN: the likely ones first, the guess first of
  all, then the rest, eg. other languages & audiobooks) to pick the one read, without another request. Picking
  one sets its ISBN & pages, & offers its own cover.

## Principles

- **Parity.** dork & the site share one data model, & agree on what is valid (see below).
- **Minimum friction.** The common things (finishing, starting, rating) take one command or one keystroke, &
  never ask for confirmation, since every change can be undone & says exactly what it did.
- **No API spamming.** Nothing is fetched without an explicit request (Enter, or a query on the command line),
  each search costs one request per source, & nothing is fetched twice in a session (see "Requests").
- **Automatic validation.** Values are checked as they are entered or fetched, & bad ones are shown rather than
  written. dork never writes an entry with a problem it didn't already have.

## Parity with the site

| What | The site | dork | Kept in step by |
|---|---|---|---|
| fields of each collection, in order, & their defaults | `content/Templates/*.md` (also Obsidian's templates) | reads the same files | the build failing if a template & the schema list different fields |
| each field's type & allowed values; status words & what they mean; slug rules | `content/schema.yaml`, read by `scripts/validateContent.js` | `dork/schema.py`, reading the same file | the one file |
| validation | `scripts/validateContent.js` | `dork/validate.py` | shared cases (`tests/validators.yaml`) run by both, & a test that breaks a copy of the vault in every way they check & insists both report exactly the same problems, word for word |
| reading YAML | the `yaml` package (YAML 1.2, core schema) | `dork/yamlcore.py`: PyYAML, restricted to YAML 1.2's core schema | parsing cases in `tests/validators.yaml` |
| fuzzy matching | `src/fuzzy.ts` | `dork/fuzzy.py`, a port | a test running both (`src/fuzzy.ts` under Node) on every entry, for a set of queries |
| star ratings, eg. `★★★★¾` | `stars()` in `src/moonAndStars.ts` | `actions.stars()` | by hand |
| ordering (eg. finished newest first, then by author's surname, then title) | the comparators of `READING_TABS` in `src/moonAndStars.ts`, with `surname()` | `actions.browse_order()`, with `slugs.surname()` | by hand (each names its twin) |
| TypeScript types of notes | `src/types/content.d.ts` | — | by hand |
| Obsidian's property types | `content/.obsidian/types.json` | — | by hand |

**YAML.** Both sides read YAML 1.2 (core schema), so dates stay text (`2024-06-28`), `3:45` isn't a number of
minutes, & `yes`/`no` aren't booleans. One known gap: PyYAML (YAML 1.1 underneath) rejects a `?` in an unquoted
item of a flow list (`[http://a.com/?b]`), where `yaml` accepts it; quote such items.

### Changing the data model

To add or change a field, a status word, or a collection, change:

1. the collection's template, in `content/Templates/` (its fields, in order, & their defaults);
2. `content/schema.yaml` (the field's type; status words; for a new collection, its template, destination, slug
   rule & statuses);
3. `content/.obsidian/types.json`, so Obsidian's property editor agrees;
4. `src/types/content.d.ts`, if the site reads the field (& wherever the site uses status words, eg.
   `READING_TABS` in `src/moonAndStars.ts`);
5. the notes themselves, if existing values no longer pass;
6. the Bases in `content/Bases/`, if their views should show it.

Then run `npm run check` (or `dork check`), & both test suites. dork needs no changes for any of this, unless
the change adds a field *type*.

### Changing a validation rule, or adding a field type

Change both validators (`checkValue` & `checkEntry` in `scripts/validateContent.js`, & `check_value` &
`check_entry` in `dork/validate.py`), keeping their messages word for word the same, & add cases for it to
`tests/validators.yaml`. Document a new type in the comment at the top of `schema.yaml`. In dork, a new type may
also want tidying of what's typed (`TIDY` & `from_text` in `dork/tui/editor.py`), & a way of being shown & changed
in the editor (`Editor.show` & `Editor.cycle`).

The shared validators report only **errors**: what the build rejects. Anything merely suspicious (a year in the
future, say) is for dork alone to warn of, & doesn't belong in them.

## Behaviour

### Status roles & dates

`schema.yaml` gives six status **roles**, which each tracked collection names in its own words (a collection
needn't name them all):

| Role | Novels & nonfiction | Films | Games | Colour | Stamps | Forbids |
|---|---|---|---|---|---|---|
| backlog | `to-read` | `to-watch` | `to-play` | yellow | — | `started`, `finished` |
| active | `reading` | `watching` | `playing` | cyan | `started` | `finished` |
| paused | `paused` | `paused` | `paused` | blue | — | `finished` |
| ongoing | — | — | `endless` | magenta | — | `finished` |
| done | `read` | `watched` | `played` | green | `finished` | — |
| dropped | `dnf` | `dnf` | `dnf` | red | — | — |

**ongoing** is for what has nothing to finish (eg. Minecraft): played, but never done, & never at the top of the
finder with what's in progress. It is set in the editor; `finish` & `dnf` still apply to it.

Quick actions & colours work on roles, so they mean the same for every collection. Taking on a role that
**stamps** a date field sets it to today, if empty.

In the editor, cycling past a status undoes its stamp, so passing `reading` on the way to `read` leaves no
`started`. A date set by hand is never touched.

Validation requires that an entry's dates agree with its status:
- no date its role **forbids** (eg. nothing in the backlog has `started`);
- `finished` isn't before `started`, compared at the coarser of their precisions (`"2024"` vs `2024-06-28`).

A date in a year before the entry's `year` isn't rejected (early access, previews & advance copies come first, &
some sources' years are wrong), but the editor warns of it, in orange.

Validation also requires, of novels, that a `series-number` comes with a `series` (the schema's `requires`), & that
no two share both (its `unique`). A series without a number is fine.

### Finding entries

The query is matched fuzzily, as in fzf, against an entry's title followed by who made it (author, first of
authors, director, or developer). Each word of the query must match, its letters in order; consecutive letters &
starts of words score higher. Accents are ignored, so "jose" finds José.

Results come best first. Ties go to entries in progress, then the backlog, then paused, done & dropped, & then
by title.

With no query (`actions.browse_order`), entries come in that order of roles (ongoing between paused & done).
Within each role:

| Role | Sorted by |
|---|---|
| done | `finished`, newest first (undated last) |
| active | `started`, newest first |
| backlog | shortlisted first |
| paused, dropped | — |

After that, entries sort by collection (in the schema's order), & then by name within it:
- kind first, in the schema's order (eg. film, series, anime), in collections with a `kind`;
- then the author's surname (or the first author's), in collections with `author` or `authors`;
- then series (a book outside one, by its title) & number in it, in collections with `series`, so that an
  author's series come out in order (as on the site's reading list);
- then title.

So the date orders run across collections (what's done reads as one timeline), while the name orders keep each
collection together. A fuller date counts as later than a partial one it falls within (`2023-05-14`, then
`"2023-05"`, then `"2023"`), as in the site's sorting. Accents & case are ignored throughout.

### Headless actions

`dork finish|start|pause|dnf|rate <query>` act without opening the finder only when the query clearly means one
entry. They consider:

1. **only entries the action can follow:**

   | Action | Applies to entries that are |
   |---|---|
   | finish, dnf | backlog, active, paused or ongoing |
   | start | backlog, paused or dropped |
   | pause | backlog or active |
   | rate | anything |

2. **only strong matches:** every word of the query appears, as typed (accents aside), in the title or who made
   it. Fuzzy matching alone would let "dune" act on "Jury Duty".

Among those, the match is **clear** if:
- it's the only one; or
- it's the only one titled exactly as the query; or
- it outscores the runner-up by half as much again.

Otherwise the finder opens, prefiltered & armed. Without a terminal (eg. in a script), the candidates are listed
instead, & dork exits with failure.

### Writing notes

- **Unchanged keys keep their lines.** A note's frontmatter is read as YAML, & also kept as lines grouped by top-level key. On
  writing, the lines of every key whose value hasn't changed (same value & type) are kept exactly as they were,
  whatever their style (Obsidian writes lists in block style, & quotes as it likes). Writing an entry unchanged
  reproduces it byte for byte. The body after the frontmatter is never touched.
- **Changed values are written in the templates' style:**
  - lists in flow style (`[a, b]`);
  - empty values bare (`rating:`);
  - full dates plain, & partial dates quoted (`finished: "2024-05"`);
  - strings plain wherever YAML 1.2 & 1.1 both read them back unchanged, & otherwise in double quotes (so
    `"1984"`, `"Dune: Part Two"`, `"yes"`, & every ISBN, are quoted);
  - whole-number ratings as integers.
- **New keys** go after the last key that comes before them in the template. Unknown keys are kept (& flagged
  by validation).
- **Files are written whole or not at all**, through a temporary file (`.<name>.dork`) renamed over the note.
  A note is only written if its text changed.

### Undo

Every change records what each file it touched held before, or that the file didn't exist. Undo restores those
files, & deletes any the change created. A rename's undo also restores the notes whose links it rewrote.

Writing a review in `$EDITOR` drops earlier changes to that note from the undo history, since undoing them would
discard the review too.

### Sources

Each source maps what it's given to the fields of its collection's template, keeping only values that validate:
a value that doesn't is left out & noted, rather than filled in as junk. When a source offers several values (eg.
ISBNs), it takes the first valid one.

- **Open Library** (novels, no key). The search asks only for each work's title, authors, first year, usual
  page count, cover & count of editions; asking for ISBNs too would bring every edition's (thousands, for a
  classic). Titles are title-cased, as some are in sentence case. Opening a hit fetches its editions, & guesses
  the edition read:
  - only editions with a valid ISBN-13, in print (not audio, e-book or large print), & not in a language other
    than English;
  - preferring one with a page count, near (within 5% of) the usual, & English named;
  - then the earliest.

  Its ISBN & pages are noted as a guess, naming the edition (`p` picks another). Searching by ISBN finds that
  edition instead, & isn't a guess. The year is the work's first, not the edition's.

  At the same time, Wikidata is asked for the work's series & number in it (by the work's Open Library id). Where
  a novel is in several (Guards! Guards! is Discworld 8, & City Watch 1), the broadest is taken (one not itself
  part of another of them), & the others noted.
- **Zotero** (nonfiction, no network). The library is read once a session, & searched as you type: every word of
  the query must appear (as typed, or the start of it), in the title, the creators, the citation key, or the year.
  - **Filename:** the citation key, from Zotero's `citationKey` field (where Better BibTeX keeps it).
  - **Title:** title-cased, as Zotero keeps sentence case: every word capitalised but small ones (a, of, the, to…)
    mid-title, & capitals already there kept. The alias is Zotero's short title, else the title before a colon.
  - **Kind:** books are "book"; articles, preprints, chapters, theses & the like are "paper"; "textbook" is yours
    to choose.
  - **Authors:** authors, or editors if there are none; translators go to `translator`.
  - **Identifiers:** the ISBN (an ISBN-13 if there is one), the DOI & arXiv id (from their fields, or from
    Extra), & the URL.
- **Wikidata** (films, series & anime, & games; no key). Each search is one SPARQL query to the Wikidata Query
  Service. It searches as Wikidata's own search box does, keeps the hits that are films or television series (or
  video games), of any subclass, & gives each one's earliest release (or a series' start), director (or a series'
  creators) or developers, & TMDB's or IGDB's id, all in one go. Anime is anything of the class anime, or in the
  genre. A year ending the query (eg. "after hours 1985") isn't searched for, but ranks hits from that year first.
  Its data is public domain (CC0), so it may be kept & shown freely.

Sources were chosen for their terms, as well as their data. TMDB's terms forbid keeping anything from it for over
six months, or deriving anything from its images, & require its logo on the site; IGDB's are less clear. Wikidata
has neither problem, & needs no account. Open Library asks clients to identify themselves (with an email), not to
bulk-download, & that public pages show its covers from its own server; dork downloads one cover per book added,
for the site to dither, which departs from that last wish, so the site should credit Open Library.

**Zotero's data is never changed.** dork opens `zotero.sqlite` read-only & immutable (`mode=ro&immutable=1`), so
SQLite refuses to write, & makes no lock, journal or WAL files beside it; nothing else of Zotero's is touched,
& its API isn't used. If Zotero is writing the database as dork reads it, & the read fails, dork reads a temporary
copy instead. A test checks the real database's hash, & its directory's listing, are unchanged by a search.

### Requests

`dork/net.py` makes every request, keeping them polite:
- **Throttled per host:** Open Library & the Wikidata Query Service get one a second, Open Library's covers one
  each half second, & others one each 0.2 s.
- **Cached:** every response is kept in memory for the session, so searching again, switching tabs, or going
  back to the hits costs nothing. (Covers aren't cached, being downloaded only once, on writing.)
- **Identified:** `User-Agent: dork/<version> (+https://github.com/dariotrinchero/dork-fort)`, with the
  `contact` setting added if set.
- **Logged,** if `$DORK_LOG` names a file: a line per request, with its size or error.
- **Off the screen's thread:** requests run in the background (four at most), so the screen never waits on them.
- **IPv4 first:** where a network routes IPv6 but it doesn't get through, Python would wait out a whole timeout
  (20 s) on every request before trying IPv4; dork tries IPv4 first (as cli-tools' `twoey.py` does).

### Slugs

A new note's filename comes from its collection's `slug.from` rule in the schema, eg. `{title|short}-{author|surname}`.
- **Making the slug:** text is lowercased, without accents or apostrophes, `&` becomes `and`, & everything else
  that isn't a letter or digit becomes a hyphen.
- **`|short`** drops a subtitle (after `: `, ` - ` or ` — `).
- **`|surname`** takes a name's last word, with any lowercase particles before it (`Ursula K. Le Guin` gives
  `Le Guin`).

The rules give the names of all the existing novels & films but one (`dr-strangelove-1964`, shortened by hand),
which the tests check.

## Code

| Module | Holds |
|---|---|
| `bin/dork` | the launcher |
| `dork/__main__.py` | the command line |
| `dork/schema.py` | finding the vault, & reading `schema.yaml` |
| `dork/yamlcore.py` | the YAML 1.2 loader |
| `dork/validate.py` | the validator (the twin of `scripts/validateContent.js`) |
| `dork/vault.py` | reading notes, writing them line-preservingly, renaming them, & undoable changes |
| `dork/slugs.py` | making slugs |
| `dork/fuzzy.py` | fuzzy matching (the twin of `src/fuzzy.ts`) |
| `dork/actions.py` | status roles, quick actions, describing changes, ranking, & clear matches |
| `dork/tui/base.py` | colours, text measurement & drawing, the line editor, & the overlays (star meter, yes-or-no question, help) |
| `dork/tui/app.py` | the screen stack, main loop, footer messages, undo history, & handing over to `$EDITOR` |
| `dork/tui/finder.py` | the finder |
| `dork/tui/add.py` | the add screen |
| `dork/tui/editor.py` | the editor |
| `dork/config.py` | settings, from `config.toml` |
| `dork/net.py` | requests: throttled, cached, identified & logged |
| `dork/sources/__init__.py` | candidates (hits), the source interface, keeping only valid values, title-casing, & the warnings of suspicious values |
| `dork/sources/openlibrary.py`, `zotero.py`, `wikidata.py` | the sources |

The UI is plain curses (standard library), in the style of `twoey.py` & `wikly.py` in `~/git-repos/cli-tools`.
It runs in raw mode, so that `^S`, `^Z` & `^C` reach dork rather than the terminal. Screens are objects with
`draw(win)` & `handle(key, ch)` methods (& optionally `opened()`, & `poll()` with `busy`, for screens waiting on
requests), pushed on the app's stack. An `overlay` is drawn over the screen below it, rather than in its place.

## Testing

```bash
python3 -m unittest discover tools/dork/tests   # dork (from the repo root)
npm test                                        # the site's validator (also run in CI)
```

**`tests/test_validate.py`** covers validation:
- the shared cases in `tests/validators.yaml` (YAML reading, field types, & whole entries);
- that the real vault is valid;
- the parity test: both validators find the very same problems in a deliberately broken copy of the vault
  (needs Node & `npm install`).

**`tests/test_vault.py`** covers the rest:
- round-trips of every note;
- how values are written;
- slugs, checked against the existing names;
- fuzzy matching, against `src/fuzzy.ts` itself (needs Node 22.6+, to run TypeScript);
- quick actions & undo, on a scratch copy of the vault;
- which queries count as clear.

**`tests/test_sources.py`** covers adding, all offline:
- each source, on responses saved in `tests/fixtures/` (real ones, each fetched once);
- Zotero, on a made-up database laid out as Zotero's, & that reading the real one (if there is one) changes
  nothing of it, or beside it;
- the request layer's caching, throttling, User-Agent & log;
- title-casing, & the warnings of suspicious values.

Tests needing Node skip themselves without it.

**Testing the UI.** It can be driven in a detached tmux session, sending keys & reading back the screen:

```bash
cp -r content /tmp/vault
tmux new-session -d -s dork -x 110 -y 30 "DORK_CONTENT=/tmp/vault DORK_LOG=/tmp/requests.log tools/dork/bin/dork; sleep 60"
tmux send-keys -t dork -l "witches"; tmux send-keys -t dork C-f
tmux capture-pane -p -t dork        # -e to see colours, as escape codes
tmux kill-session -t dork
```
