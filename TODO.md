# Dork Fort Neocities Project

## Migrating content, one topic at a time

For each topic: move it over, delete the placeholder in its folder, check it in Obsidian (its Base), & then
delete the original. See [Content](#content-organisation--workflow) for where everything goes.

2. **Wishlist:** likewise to `content/pages/wishlist.md`, with `destination: companion`; prune what you'd rather
   not publish.
3. **Music backlog:** process it into your new system, then delete it (not published).
4. **Books:** imported from StoryGraph (96 in `novels/`, 21 in `nonfiction/`). Check the split, `kind`s, tags &
   topics in the Novels & Nonfiction Bases, then close the StoryGraph account.
5. **Build `dork`** (see [TODO_DORK.md](TODO_DORK.md)); `dork fill` then gives the imported
   novels their `year`, `pages` & `cover` from Open Library.
6. **Letterboxd:** either close the account, or keep logging there & pull its RSS feed
   (`letterboxd.com/<user>/rss/`) into `films/` at build, as with iNaturalist.
7. **Papers:** `dork add nonfiction` (from Zotero) as you go.
8. **Recipes** (in their own vault): `rating:`, the `favourite` tag, & `Journal/` (see Campfire).
9. **Garden:** log on iNaturalist from now on, & upload past sightings' photos (it reads dates & places from
   EXIF); add `content/garden/` notes only where there's more to say.
10. **Adventures:** a file per outing (Adventure template), with GPX files from the watch in `attachments/gpx/`, as far
    back as you care to go.
11. **Blog:** whenever.

---

## Deferred from code audit

- `warp.ts`/`warp.frag`: `uCutoff` & `uMagnitude` only ever act as their product (the scale is
  `1 + cutoff·magnitude·(t⁴ − 1)`), so could become a single "strength" parameter.
- `renderPipeline.ts`: `SeriesPass.outputDims` is unused. Keep it only if a lower-resolution pass (eg. half-res
  bloom/glow) is planned; otherwise remove it, along with its part of the plan key.

---

## Concept: the canvas is the *shell*, windows are the *documents*

Long-form reading (recipes, notes, travel posts, galleries) inside a WebGL text grid would mean rebuilding
scrolling, links, images, text selection, & accessibility. So split by content type:

- **In-canvas (the shell):** navigation, short outputs, listings, bios, easter eggs. Each destination's command
  prints a description & menu in the space freed when its icon slides to the top.
- **Text-mode windows (the documents):** DOM windows over the same screen, in the style of Turbo Vision /
  Midnight Commander, with the faded QR code & terminal still visible around them.

**Every window is also a static page.** The build generates eg. `/campfire/pasteis-de-nata.html`, containing the
window's markup.
- With JS, `index.js` boots the CRT behind it: the QR code is faded, the shell shows `>> cat pasteis-de-nata`, &
  closing the window reveals the campfire output.
- Without JS (crawlers, screen readers, Neocities' search), it is a plain readable page.
- Opening a document from the shell fetches that page, swaps its window in, & `pushState`s the URL, so links,
  reloads & sharing all work.

### Window contents

- Links render as `[bracketed text]` in the section's accent colour; `## headings` keep their hash marks in dim
  (as in the placeholder recipe); code blocks are framed in box-drawing characters.
- **Images:** `image-rendering: pixelated`, optionally dithered at build time to match the pixel art.
- **Fonts:** windows need more glyphs than the canvas subset (Latin-1, `’ “ ” — é …`). Build a second, wider
  subset for windows rather than bloating the canvas atlas.

### Transitions

- **CRT power-off:** the picture squashes to a bright horizontal line, then to a dot, then fades. This is one
  `uPower` uniform in `warp.frag`/`crt.frag`, taking ~400 ms. Use it for leaving the site (eg. `open work`) & for
  `exit` (see the easter eggs).
- **CRT power-on** when booting, including from a deep link to a window's static page.
- **404 page as a joke that works:** `not_found.html` boots the same app, & the shell "runs" the bad path:
  `>> cd /gardn/tomatos` → `dsh: no such destination: gardn` → `did you mean garden?` (clickable).

---

## Destinations

These follow your stated use cases. The ideas for companion, and for splitting up the garden, are mine.

| Command | Content | In-canvas output | Windows |
|---|---|---|---|
| `ssh {realm-of-forms}` | technical blog + link to the professional site | fake host-key prompt: `The authenticity of host 'realm-of-forms (∞)' can't be established… (yes/no)?` → type/tap `yes` → **sub-shell** with prompt `plato@realm-of-forms:~$` in its purple accent. Its `ls` lists posts (newest first, with tags); `open work` / `ssh work` gives a `you are leaving the fort…` confirmation, then follows the professional-site link. `exit` → `Connection closed. You return to the cave.` The ssh metaphor ("connecting to another machine") neatly marks the personal/professional boundary. | blog posts; external professional site |
| `cat {traveller}` | adventures: photos, climbing / running / camping logs | a **logbook**, one line per outing: `2026-09-12 ▲ climb  Table Mtn  6b+ ×4`, `2026-09-20 ↝ run  21.1 km 1:48 ▁▂▄▆█▆▄▂▁`, with **elevation sparklines** in `▁▂▃▄▅▆▇█`, which `glyphs.json` already contains. Flags filter it (`cat traveller --climb`), & the flags highlight as flags. | trip reports with photo galleries & route/elevation details |
| `{whoami}` | general about | — | maybe one about window for the long version |
| `ls {garden}` | mushrooms & frogs: a **field guide** | `tree` listing (`├──`, `└──`) of beds: `fungi/`, `frogs/`, `other-critters/`, each specimen with the date found | specimens styled as field-guide cards: dithered photo + a `genus · found · where · notes` block |
| `sort {moon-and-stars}` | the curated lists (books, music, films, tools, places) | `sort` *is* ranking, so the items print **jumbled, then visibly sort themselves** (swaps flash) into your ranking. This splits the garden's "abstract" half off into a destination whose verb already fits. | one per list |
| `touch {campfire}` | cooking & recipes | see [Campfire](#campfire-recipes-favourites--cooking-journal) below. Also a `make` easter egg: `make pancakes` "builds" the recipe like a Makefile target (`cc flour.o eggs.o milk.o -o pancakes`). | recipes, cookbook, journal |
| `ping {companion}` | **proposal: people & company**: friends' sites (blogroll / webring), a guestbook, & contact | real-looking ping lines, one per ~400 ms, *each one a friend's site*: `64 bytes from wren.neocities.org: icmp_seq=3 time=48 ms`, ending in stats (`0% packet loss — all friends alive`), then `leave a note? (y/n)` for the guestbook. **Bonus:** the chicken itself is a tiny tamagotchi (`feed chicken`, `pet chicken`, its mood saved in `localStorage`). | external links; guestbook |

Content for destinations other than campfire lives in `content/` (see [Content](#content-organisation--workflow)).

---

## Content: organisation & workflow

Content comes in two shapes:
- **Collections:** one file per thing, with typed frontmatter (novels, films, adventures, blog posts…). The site
  builds an index & a window per entry. Tables, in Obsidian (Bases) & on the site, are views of these, never
  edited by hand.
- **Pages:** undated, standalone documents that you keep editing (eg. the packlist), each a window in the menu of
  the destination it names. A ranked **list** is a page whose body is numbered wikilinks
  (`1. [[princess-mononoke-1997|Princess Mononoke]]`), reordered by moving lines.

### Layout

`content/` is an Obsidian vault in this repo (the recipes vault stays separate, read as a second root). Folders
go by type; the bake script maps them to destinations, so content can move between destinations without moving
files. Each folder holds one lorem-ipsum placeholder until its real content arrives.

| Folder | Holds | Destination |
|---|---|---|
| `novels/` | literature (incl. plays & short stories) | moon-and-stars |
| `nonfiction/` | textbooks, books & papers (`kind: textbook \| book \| paper`) | realm-of-forms |
| `films/` | films, series & anime (`kind: film \| series \| anime`) | moon-and-stars |
| `games/` | video games | moon-and-stars |
| `boardgames/` | board, card & other tabletop games | moon-and-stars |
| `adventures/` | one per outing | traveller |
| `garden/` | notes on iNaturalist observations | garden |
| `blog/` | blog posts, dated (newest first on the site) | realm-of-forms |
| `pages/` | standalone pages (packlist, wishlist) & ranked lists | each names its own `destination` |
| `attachments/` | `covers/`, `posters/`, `photos/` (Obsidian pastes here), `gpx/` | — |
| `Templates/`, `Bases/` | templates (also read by `dork`), & table views | — |
| `schema.yaml` | the type of every field, read by the build & `dork` | — |

The repo is public, so all of `content/` is visible on GitHub, even what the site leaves out; anything private
stays in `~/Documents/Notes`.

### Naming

Filenames are slugs, which are also the URLs (`build/<dest>/<slug>.html`), so they are unique, shell- & URL-safe,
& stable when a title is corrected:
- **novels:** `<title>-<surname>`, without any subtitle (`the-cave-saramago`, `earthsea-le-guin`).
- **films:** `<title>-<year>` (`after-hours-1985`).
- **nonfiction:** the item's citekey in Zotero (eg. `kripkeNamingNecessity1980`), so notes line up with
  `[@citations]`; Zotero's edition also gives `year` & `isbn`. Read the key, never guess it: Better BibTeX's
  stopwords (`after`, `is`…), transliteration (`Möller` → `moller`) & edition years defeat imitation. Only items
  not in Zotero (Didion, Hofstadter, Pratchett, for now) have keys guessed in its format; add them to Zotero
  & rename.
- **adventures & garden:** `<date>-<place>` (`2026-10-01-table-mountain`).
- **blog & pages:** `<title>`.

Every file has `title:` (in full) & `aliases:` (the short title), so typing `[[The Cave` in Obsidian suggests
the file & inserts `[[the-cave-saramago|The Cave]]`, & Bases show `title` rather than the filename. The recipes
vault keeps human names (no slugs in the kitchen).

### Schemas

The templates give each collection's fields (in order) & defaults; `content/schema.yaml` gives their types,
& is read by both the build & `dork`, which check notes by the same rules. Novels, nonfiction, films & games
share (& board games, but for their dates):
- **`status`:** `to-read | reading | paused | read | dnf` (films: `to-watch | watching | paused | watched |
  dnf`; games: `to-play | playing | paused | endless | played | dnf`, where `endless` is for games with nothing
  to finish, eg. Minecraft), set explicitly, as many reads have no dates. The build checks it agrees with the dates (eg. no
  `finished` while `to-read`). Rereads aren't tracked.
- **`started` & `finished`:** optional, & as precise as known: `2024-06-28`, `"2024-05"` or `"2023"` (quoted, so
  YAML keeps them as text). Text properties in Obsidian, so partial dates aren't flagged, & they still sort.
- **`rating`:** 1–5 in quarter steps (as StoryGraph had), a Number property (in `types.json`), shared with
  recipes & the journal. Bases shows stars through a formula (untested: check `repeat()` against the Bases
  function reference); the site draws `★★★★¾`.
- **`recommended-by`:** initials only (eg. `JS`); the build rejects anything else, so no names get published by
  accident. Also `shortlist` & `tags`.
- **`owned`** (novels, nonfiction, games & board games): `true`, `false` (eg. borrowed from a library), or
  `wishlist` (not owned, but wanted), which each one's Base lists in a Wishlist view.
- The body holds the review or comments.

Per collection:
- **novels:** `author`, `translator`, `series` & `series-number` (eg. Discworld & 8; a number needs a series, & no
  two novels share both), `year`, `isbn` (quoted), `pages`, `cover`, `owned`.
- **nonfiction:** `kind`, `authors`, `translator`, `year`, `isbn`, `topics`, `doi`, `arxiv`, `url`, `owned`. Indexed
  by topic.
- **films:** `kind`, `year`, `director` (or creator), `tmdb` (`movie/<id>` or `tv/<id>`), `poster`.
- **games:** `year`, `developer`, `platform` (what it was played on), `igdb` (its slug there), `cover`, `owned`.
- **board games:** `year`, `designer`, `players` (eg. `"2–4"`), `bgg` (its id on BoardGameGeek), `cover`, `owned`;
  only `to-play | played` (played at all, as they're played again & again), with `first-played` rather than
  `started` & `finished`.
- **adventures:** `date`, `activity` (climb, run, hike, camp…), `place`, `grade`, `distance` (km), `time`
  (`"h:mm"`, quoted, or YAML 1.1 reads it as a number), `ascent` (m), `gpx`, `photos`.
- **garden:** `date`, `inaturalist` (observation id), `species`, `place`, `photos`.
- **blog:** `date`, `draft`. **pages:** `destination`, `draft`.

`draft: true` keeps any file off the site. Spoilers in reviews are `<span class="spoiler">…</span>`, hidden in
windows until clicked.

### Authoring

Obsidian & vim both work on the same files. Obsidian is for browsing, Bases, the property editor, the phone,
pasting photos, & renames (which update links); its Templates cover adventures, sightings, blog posts, & pages
(Page, or List for a ranking). The `dork` CLI is the template engine for novels, nonfiction, & films, as it fills
in metadata.

### `dork` CLI

Designed, & tracked, in [TODO_DORK.md](TODO_DORK.md): a TUI & CLI in `tools/dork/` (in this repo, for parity
with the build) for adding & updating novels, nonfiction, films & games. Metadata is fetched when adding, never
at build time, so builds don't depend on the APIs.
- Maybe later: a `workflow_dispatch` action running `dork add` (taking the top match) from the GitHub app on
  the phone.

### Build

`scripts/bakeContent.js` generalises `bakeRecipes.js`: each collection gives a source folder, schema,
destination, & templates, & the recipes are one more collection (from `RECIPES_DIR`).
- **Validation** (done; `scripts/validateContent.js`, from `schema.yaml`): filenames that aren't slugs (or
  clash), unknown keys, wrong types, ratings off the quarter steps, a `status` at odds with the dates,
  `recommended-by` that isn't initials, missing attachments, or templates out of step with the schema fail the
  build (& only warn in dev), naming the file & field. `npm run check` runs it alone.
- **Feeds:** iNaturalist observations (`api.inaturalist.org/v1/observations?user_id=…`, no key), fetched at
  build with a fallback snapshot so an outage doesn't fail the deploy, & joined with `garden/` notes by
  `inaturalist` id. GPX files become elevation sparklines.
- **Outputs:** as for the recipes: `build/<dest>/<slug>.html` per entry, index pages, & compact indexes bundled
  into `index.js` (so eg. `ls garden` lists real entries).
- **Triggers:** pushing to `main` deploys; the nightly schedule picks up recipes & iNaturalist; the dev server
  watches `content/`.

---

## Campfire: recipes, favourites & cooking journal

The campfire surfaces the recipe vault (`~/git-repos/recipes`, public on GitHub) through a searchable cookbook,
a list of favourites, & a cooking journal.

The vault is an Obsidian vault:
- 146 recipes in course folders, each with the same frontmatter (Source, Cook Time, Course, Meal type,
  Servings, Unusual Ingredients, Vegan, tags) & the same body (`# Ingredients` / `# Method` / `# Notes`);
- Obsidian syntax: `[[Recipe]]`, `[[Recipe#Heading|alias]]` & `![[photo.png]]` (6 photos of 1–3 MB);
- 3 Zotero citations (`[@key]`), whose library is git-ignored;
- 30 recipes tagged `untried`/`todo`.

### Remaining user flow

1. In the campfire output: real favourites (tag `favourite`), maybe `recently cooked` rows (the newest journal
   entries), & hints for `grep <words>` & `cat <recipe>`.
2. `grep miso --vegan --quick` lists matching recipes in the output pane, as clickable rows.
   - It searches titles, tags, ingredients & notes.
   - Flags: `--vegan`, `--main`/`--side`/`--dessert`/…, `--quick` (≤ 45 min) & `--fav`.
3. `cat <recipe>` (Tab completes recipe names) opens the **recipe window**:
   - a meta line (time · servings · vegan · tags);
   - Ingredients as tickable `[ ]` rows, Method, & Notes;
   - "cooked 3×" with its journal entries, & the source attribution & link.
4. The cookbook gets filter toggles (see the cookbook views below).

### Cookbook views (ideas)

Ways to show more than names & cook times (eg. course, meal type, servings, vegan) without much room:

1. **Course tabs** under the title, drawn with box-drawing characters: `all │ mains │ sides │ desserts │ starters
   │ components`, mirroring the views in the vault's `Overview.base`. ←/→ switch tabs, & the tab could go in the
   URL (`#campfire/cookbook/mains`).
2. **Details in the status line:** rows stay one line (`title ··········· 1h ✓v`, with dot leaders & a vegan
   mark), & the window's bottom border shows the selected row's details (`main · curry, hearty · serves 3–4 ·
   cashews`).
3. **Filters typed into the search**, eg. `grep miso vegan course:main time:<45`: recognised filters highlight
   like flags, & the rest is fuzzy-matched. Powerful & needs no room, but less discoverable, so it would
   complement the tabs rather than replace them.
4. **Two panes on wide screens:** the list at left, & a preview of the selected recipe at right (as in Midnight
   Commander); a single list on phones.

Start with 1 & 2, which show the details without adding columns to rows already tight on phones; 3 can follow.

### Content pipeline (build time)

`scripts/bakeRecipes.js` reads the vault from `RECIPES_DIR`, which defaults to `../recipes`.
- **Parsing:** frontmatter via `yaml`; the body via `markdown-it` with small Obsidian rules:
  - wikilinks → links to recipe windows (anchor & alias kept), dimmed if the target is unpublished;
  - embeds → photos resized to ~800 px WebP via `sharp`;
  - citations → plain text (or simply rewrite the 3 in the vault).
- **Publishing policy:** a `Publish: full | card | hidden` field, defaulting by Source:
  - a URL, a quoted book title, Instagram or meal-kit sources → `card`: name, meta, tags, ingredients, your
    Notes, & a link to the original;
  - everything else (Original, Adapted, friends) → `full`;
  - `todo` → `hidden`; `untried` stays published, marked "untried".
  The build prints how many recipes got each policy, so overrides are easy to spot.
- **Journal:** a `Journal/` folder in the vault, one note per cook (eg.
  `Journal/2026-10-02 Pasteis de Nata.md`). Frontmatter holds `date`, `recipes: ["[[Pasteis de Nata]]"]` &
  optionally `rating` & `photo`; the body holds notes. Each recipe's entries are **derived from these links**,
  so there's no upkeep in the recipes themselves.
- **Outputs:**
  - a compact `recipes` index (slug, title, folder, meta, tags, favourite, ingredient words, latest cook) for
    the canvas & the cookbook, imported as a virtual esbuild module in the same way as `assets/qr.svg`. It
    returns `watchDirs` so edits in Obsidian hot-reload the dev server.
  - `build/campfire/<slug>.html` per recipe, `index.html` & `journal.html`, from one template.
- **Fetching:** clone at build. Locally, the vault is read in place. `deploy.yml` adds an `actions/checkout`
  step for `dariotrinchero/recipes` into `./recipes` (public, so no token), plus `schedule` (nightly) &
  `workflow_dispatch` triggers, so recipe pushes reach the site without touching dork-fort.

### Changes, by file

- **Vault** (`~/git-repos/recipes`):
  - a `Journal/` folder & `Templates/Journal Entry.md`;
  - the `favourite` tag on favourites, & optional `Publish:` overrides;
  - the 3 `[@citations]` rewritten in plain text.
- **New:** `scripts/bakeRecipes.js` & `scripts/templates/window.html`.
- **`src/campfire.ts`:** real recipes in place of the placeholders; `grep`, `cat`, & recipe completions.
- **`src/window.ts`:** fetching pages into windows, & booting from deep links.
- **`src/shell.ts`:** flags on commands (they already highlight dim); completion candidates supplied by modules
  (recipe names).
- **`scripts/build.js`:** the virtual module plugin & the call to `bakeRecipes.js` in `onEnd`, next to font
  subsetting.
- **`package.json`:** dev dependencies `yaml`, `markdown-it` & `sharp` (build time only; nothing added to the
  bundle).
- **`.github/workflows/deploy.yml`:** the recipes checkout & the extra triggers.

### Verification

- `RECIPES_DIR=~/git-repos/recipes npm run dev`:
  - the build log reports 146 recipes with the policy counts;
  - editing a recipe in Obsidian hot-reloads;
  - spot-check a `full` page, a `card` page, a page with a photo, & a wikilink with an anchor (`Soft Taco Shells
    #Blueprint…`).
- In the canvas: `touch campfire` shows favourites & recent cooks; `grep chickpea --vegan` lists sensible rows;
  `cat ba` + Tab completes; clicking a row opens the window; browser back/forward behave.
- Load `/campfire/<slug>.html` directly, & with JS disabled (a plain page).
- On a phone (or emulator): window scrolling, tickable ingredients, the screen staying awake, & that the
  scanline overlay pitch matches the canvas.
- `npm run build` (tsc + ESLint pass), then `npm run publish -- --dry-run` to see the new `campfire/` files.

---

## The prompt as a real shell (`dsh`)

### Input

- Double Tab lists completion candidates.
- Ctrl+C aborts a running command (prints `^C`); Ctrl+L clears.
- Keep the prompt visible above the iOS keyboard (watch `visualViewport`).

### Commands

**Core:** `open <dest>`, `history`, `man <cmd>`, `echo`, `date`, `uptime` (since the site launched). Once the
table grows, split it out of `shell.ts` into `commands.ts`.

**Navigation:** **did-you-mean** for unknown words (edit distance ≤ 2), & perhaps more aliases (group names
like `chicken`; `notes`, `gallery`, `projects`).

**Easter eggs** (left out of `help`, but `help --all` hints that there are more):

- `sudo` could also flash red; `sudo make me a sandwich` → `Okay.` (xkcd 149)
- `rm -rf /` → the QR modules **crumble & fall** column by column (per-column offsets in `qr.frag`), then
  `restoring from backup…` & they reassemble
- `touch grass` → `you went outside. +10 HP` → navigates to the garden
- `cat` (no args) → an ASCII cat; `sort` (no args) → `everything in its right place.`
- `who am i` (with spaces) → `a question for the realm of forms…` (a hint at `ssh`)
- `degauss` → the classic CRT degauss wobble (a hue/UV wobble burst in `crt.frag`), clearing the purity blotch
  (see the CRT corner effects below)
- `exit` at the top level → the power-off animation, then `[ press any key ]` to power back on
- `vim` → `you are now trapped.`, & `:q` actually frees you; `emacs` → `M-x butterfly` (xkcd 378)
- `xyzzy` → `Nothing happens.`; `fortune` → a rotating aphorism (Plato-flavoured?); `cmatrix` → glyph rain for
  5 s in the accent colours; the Konami code → the QR goes rainbow
- `uname -a` → `DorkFort 1.0 campfire-kernel #1 SMP PREEMPT_DYNAMIC dsh x86_64`
- campfire: the modules flicker (noise on its hover intensity) when it is touched; `make <recipe>` (above)

### Syntax highlighting

- Paths naming a destination take its accent from their first segment (`garden/tomatoes.md`).
- A quote-aware tokenizer: quoted strings in `fg`, with the quotes in `dim`.

### Output

- A scrollbar in the right-hand column, built from glyphs the atlas already has (`░` track, `█` thumb).
- Touch-drag scrolling (currently only the wheel & PgUp/PgDn scroll), plus space to page down & q to quit, as
  in `less`.
- Async commands can `await sh.sleep(ms)` for pacing (ping, ssh handshake), & Ctrl+C cancels them.

### Using the space

The large, grid-aligned font leaves few columns across the QR code, so:

- Output not tied to a destination (`help`, errors), shown over the faded QR code, could use most of the screen
  width rather than just the QR code's.
- On phones in portrait, output could run into the free space below the QR code (with the prompt at the bottom).
- `columns()` could move the right column onto its own (indented) line when it would be too narrow.
- Tighter wording, eg. "places (tap QR code or type):" → "places:", & likewise for the hint & placeholder
  messages.

### CRT corner effects

- Misconvergence: colour separation (now uniform) growing towards the edges & corners.
- Maybe a faint warm purity blotch in a corner, as from a magnetised shadow mask (for `degauss` to clear).

### Accessibility

- A visually hidden `<nav>` lists real links to the destination pages, plus a `<noscript>` fallback.
- The output is mirrored into an `aria-live="polite"` region.

---

## Phases (each one shippable)

1. **Shell, continued:** the input, command, highlighting, & output items above (except the eggs).
2. **Campfire:**
   1. *Pipeline & static pages:* the bake script, policy, templates, recipe & index pages (with client-side
      search), & the CI checkout. Useful on its own, as plain pages.
   2. *Windows:* loading real pages into windows, & booting from a deep link.
   3. *Canvas campfire:* real favourites, `grep`/`cat`, & Tab-completed recipes.
   4. *Journal:* the vault conventions, derived backlinks, & journal rows & pages.
   5. *Kitchen extras:* ticked ingredients saved per recipe in `localStorage`, a `--serves 4` scaler,
      tappable durations in the method starting countdown timers, & keeping the screen awake.
3. **Other destinations:** the `dork` CLI, generalising the bake script to the `content/` collections (see
   Content), the in-canvas outputs, the power-off/on transitions, & the 404-as-shell.
4. **Delight:** the easter eggs & shader effects (degauss & CRT corner effects, crumble, cmatrix, the ssh
   sub-shell, the campfire flicker).

### Glyphs to add to `glyphs.json`

Box drawing `U+2500–257F` (trees, frames, rules). `♥` if wanted. Departure Mono has these.

---

## Open questions

- Does companion as people/guestbook (+ the pet chicken) suit you?
- A guestbook (under companion) needs somewhere to store notes, which Neocities' static hosting can't provide.
  The options are a tiny external endpoint (eg. a Cloudflare Worker + KV) or an embedded third-party guestbook
  in the companion window. It can come last.
- Photos (traveller, garden, campfire): how many, & how large? Thumbnails should be resized/dithered at build
  time, & keeping full-size originals out of the repo may matter for Neocities' storage limits.
