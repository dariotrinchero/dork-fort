# Handlebody Neocities Project

## Top priority

1. Add a rat to the garden (Baraka).
2. Add moon spoon to companion.
3. Ingest isiXhosa cue card library into companion; have it be searchable, show Anki stats etc.
4. Add knitted frogs to garden.

## Migrating content, one topic at a time

For each topic: move it over, delete the placeholder in its folder, check it in Obsidian (its Base), & then
delete the original. See [Content](README.md#content) for where everything goes.

1. **Wishlist:** to `content/pages/wishlist.md`, with `destination: companion`; prune what you'd rather not
   publish.
2. **Music backlog:** process it into your new system, then delete it (not published).
3. **Letterboxd:** either close the account, or keep logging there & pull its RSS feed
   (`letterboxd.com/<user>/rss/`) into `films/` at build, as with iNaturalist.
4. **Recipes** (in their own vault): `rating:`, the `favourite` tag, & `Journal/` (see Campfire).
5. **Garden:** log on iNaturalist from now on, & upload past sightings' photos (it reads dates & places from
   EXIF); add `content/garden/` notes only where there's more to say.
6. **Adventures:** a file per outing (Adventure template), with GPX files from the watch in `attachments/gpx/`, as
   far back as you care to go.

---

## Windows as static pages

**Every window should also be a static page.** The build generates eg. `/campfire/pasteis-de-nata.html`,
containing the window's markup.
- With JS, `index.js` boots the CRT behind it: the QR code is faded, the shell shows `>> cat pasteis-de-nata`, &
  closing the window reveals the campfire output.
- Without JS (crawlers, screen readers, Neocities' search), it is a plain readable page.
- Opening a document from the shell fetches that page, swaps its window in, & `pushState`s the URL, so links,
  reloads & sharing all work.

### Window contents

- Links render as `[bracketed text]` in the section's accent colour; `## headings` keep their hash marks in dim;
  code blocks are framed in box-drawing characters.
- **Images:** `image-rendering: pixelated`, optionally dithered at build time to match the pixel art.
- **Fonts:** windows need more glyphs than the canvas subset (Latin-1, `’ “ ” — é …`). Build a second, wider
  subset for windows rather than bloating the canvas atlas.
- **Spoilers** in reviews (`<span class="spoiler">…</span>`), hidden until clicked.

### Transitions

- **CRT power-off:** the picture squashes to a bright horizontal line, then to a dot, then fades: one `uPower`
  uniform in `warp.frag`/`crt.frag`, taking ~400 ms. Use it for leaving the site (eg. `open work`) & for `exit`.
- **CRT power-on** when booting, including from a deep link to a window's static page.
- **404 page as a joke that works:** `not_found.html` boots the same app, & the shell "runs" the bad path:
  `>> cd /gardn/tomatos` → `hdl: no such destination: gardn` → `did you mean garden?` (clickable).

---

## Destinations

- **`ssh realm-of-forms`** (technical blog + professional site): a fake host-key prompt (`The authenticity of host
  'realm-of-forms (∞)' can't be established… (yes/no)?`) → `yes` → a **sub-shell** with prompt
  `plato@realm-of-forms:~$` in its purple accent. Its `ls` lists posts (newest first, with tags); `open work` /
  `ssh work` confirms `you are leaving the fort…`, then follows the professional-site link. `exit` →
  `Connection closed. You return to the cave.`
- **`cat traveller`** (adventures): a **logbook**, one line per outing (`2026-09-12 ▲ climb  Table Mtn  6b+ ×4`,
  `2026-09-20 ↝ run  21.1 km 1:48 ▁▂▄▆█▆▄▂▁`), with elevation sparklines; flags filter it (`--climb`). Windows:
  trip reports with photo galleries & route/elevation details.
- **`ls garden`** (a field guide): a `tree` listing of beds (`fungi/`, `frogs/`, `other-critters/`), each
  specimen with the date found. Windows: field-guide cards (dithered photo + `genus · found · where · notes`).
- **`sort moon-and-stars`:** see [Moon & stars](#moon--stars-making-the-media-fun).
- **`touch campfire`:** see [Campfire](#campfire). Also `make pancakes` "builds" the recipe like a Makefile
  target (`cc flour.o eggs.o milk.o -o pancakes`).
- **`ping companion`** (friends' sites, guestbook, contact): ping lines, one per ~400 ms, *each one a friend's
  site* (`64 bytes from wren.neocities.org: icmp_seq=3 time=48 ms`), ending in `0% packet loss — all friends
  alive`, then `leave a note? (y/n)` for the guestbook. The chicken as a tiny tamagotchi (`feed chicken`,
  `pet chicken`, its mood in `localStorage`).

---

## Content build

`scripts/bakeContent.js` so far bakes frontmatter into module data. Still to do:
- **Bodies & pages:** `build/<dest>/<slug>.html` per entry, & index pages; recipes as one more collection (from
  `RECIPES_DIR`).
- **Feeds:** iNaturalist observations (`api.inaturalist.org/v1/observations?user_id=…`, no key), fetched at
  build with a fallback snapshot so an outage doesn't fail the deploy, & joined with `garden/` notes by
  `inaturalist` id. GPX files become elevation sparklines.
- **Triggers:** a nightly schedule (& `workflow_dispatch`) to pick up recipes & iNaturalist.
- Maybe: a `workflow_dispatch` action running `hdl add` (taking the top match) from the GitHub app on the phone.

---

## Campfire

The campfire surfaces the recipe vault (`~/git-repos/recipes`, public on GitHub) through a searchable cookbook,
a list of favourites, & a cooking journal. `src/campfire.ts` still shows placeholders.

### User flow

1. In the campfire output: real favourites (tag `favourite`), maybe `recently cooked` rows (the newest journal
   entries), & hints for `grep <words>` & `cat <recipe>`.
2. `grep miso --vegan --quick` lists matching recipes as clickable rows, searching titles, tags, ingredients &
   notes. Flags: `--vegan`, `--main`/`--side`/`--dessert`/…, `--quick` (≤ 45 min) & `--fav`.
3. `cat <recipe>` (Tab completes recipe names) opens the **recipe window**: a meta line (time · servings · vegan ·
   tags); Ingredients as tickable `[ ]` rows, Method, & Notes; "cooked 3×" with its journal entries, & the source
   attribution & link.
4. **Cookbook views:** course tabs (`all │ mains │ sides │ desserts │ starters │ components`, mirroring the
   vault's `Overview.base`, maybe in the URL as `#campfire/cookbook/mains`), & the selected row's details in the
   window's bottom border (`main · curry, hearty · serves 3–4 · cashews`), with rows kept to one line
   (`title ··········· 1h ✓v`). Later: filters typed into the search (`grep miso vegan course:main time:<45`), &
   two panes (list + preview) on wide screens.
5. **Kitchen extras:** ticked ingredients saved per recipe in `localStorage`, a `--serves 4` scaler, tappable
   durations in the method starting countdown timers, & keeping the screen awake.

### Pipeline

`scripts/bakeRecipes.js` (or a collection of `bakeContent.js`) reads the vault from `RECIPES_DIR` (default
`../recipes`):
- **Parsing:** frontmatter via `yaml`; the body via `markdown-it` with small Obsidian rules: wikilinks → links to
  recipe windows (anchor & alias kept), dimmed if the target is unpublished; embeds → photos resized to ~800 px
  WebP via `sharp`; the 3 `[@citations]` → plain text (or rewrite them in the vault).
- **Publishing policy:** a `Publish: full | card | hidden` field, defaulting by Source: a URL, a book title,
  Instagram or meal-kit sources → `card` (name, meta, tags, ingredients, your Notes, & a link to the original);
  everything else → `full`; `todo` → `hidden`; `untried` stays published, marked "untried". The build prints the
  count per policy.
- **Journal:** a `Journal/` folder in the vault (& `Templates/Journal Entry.md`), one note per cook (eg.
  `Journal/2026-10-02 Pasteis de Nata.md`), with `date`, `recipes: ["[[Pasteis de Nata]]"]`, & optionally
  `rating` & `photo`; each recipe's entries are derived from these links.
- **Outputs:** a compact `recipes` index (slug, title, folder, meta, tags, favourite, ingredient words, latest
  cook) as a virtual module, with `watchDirs` for hot reload; `build/campfire/<slug>.html` per recipe,
  `index.html` & `journal.html`.
- **CI:** `deploy.yml` checks out `dariotrinchero/recipes` into `./recipes` (public, so no token).

---

## Moon & stars: making the media fun

The explorers (`src/moonAndStars.ts`) work, but read like laundry lists. Ideas (start with 1, 2 & 4):

1. **Entries as man pages:** NAME, a short synopsis, the fields, & **SEE ALSO**, linking the rest of the series,
   the same author (director, designer…), & entries sharing tags.
2. **A neofetch header** atop each explorer: `96 books · 54 read · 18,230 pages · avg ★★★½ · most read: Le Guin
   (6)`, with a sparkline of entries finished per year (`▁▂▄█▆`), or a `░▒▓█` grid of months.
3. **Covers,** dithered at build time (from `attachments/covers/`), on entries' pages.
4. **A star chart:** finished entries as stars in a text-mode sky, brighter for higher ratings (`·` `∙` `•` `✦`
   `★`), with a series (or an author's books) joined into a constellation. Hovering names a star, & clicking
   opens it; maybe each explorer's first tab.
5. **The `sort` animation:** entries appear jumbled, then visibly swap into order, on opening an explorer or
   switching tabs.
6. **Commands:** `roll --players 3` picks a board game for that many players (with a dice animation), & `shuf`
   picks the next book or film from the shortlist.
7. **Voice:** short lines with some personality, eg. `recommended by JS`, `abandoned on p. 112`, or a remark
   chosen by rating.

---

## The prompt as a real shell (`hdl`)

### Input

- Double Tab lists completion candidates.
- Ctrl+C aborts a running command (prints `^C`); Ctrl+L clears.
- Keep the prompt visible above the iOS keyboard (watch `visualViewport`).

### Commands

- **Core:** `open <dest>`, `history`, `man <cmd>`, `echo`, `date`, `uptime` (since the site launched). Once the
  table grows, split it out of `shell.ts` into `commands.ts`.
- **Navigation:** **did-you-mean** for unknown words (edit distance ≤ 2), & perhaps more aliases (`chicken`,
  `notes`, `gallery`, `projects`).

### Easter eggs

Left out of `help`, but `help --all` hints that there are more:

- `sudo` could also flash red; `sudo make me a sandwich` → `Okay.` (xkcd 149)
- `rm -rf /` → the QR modules **crumble & fall** column by column (per-column offsets in `qr.frag`), then
  `restoring from backup…` & they reassemble
- `touch grass` → `you went outside. +10 HP` → navigates to the garden
- `cat` (no args) → an ASCII cat; `sort` (no args) → `everything in its right place.`
- `who am i` (with spaces) → `a question for the realm of forms…` (a hint at `ssh`)
- `degauss` → the classic CRT degauss wobble (a hue/UV wobble burst in `crt.frag`), clearing the purity blotch
- `exit` at the top level → the power-off animation, then `[ press any key ]` to power back on
- `vim` → `you are now trapped.`, & `:q` actually frees you; `emacs` → `M-x butterfly` (xkcd 378)
- `xyzzy` → `Nothing happens.`; `fortune` → a rotating aphorism (Plato-flavoured?); `cmatrix` → glyph rain for
  5 s in the accent colours; the Konami code → the QR goes rainbow
- `uname -a` → `Handlebody 1.0 campfire-kernel #1 SMP PREEMPT_DYNAMIC hdl x86_64`
- campfire: the modules flicker (noise on its hover intensity) when it is touched

### Syntax highlighting

- Paths naming a destination take its accent from their first segment (`garden/tomatoes.md`).
- A quote-aware tokenizer: quoted strings in `fg`, with the quotes in `dim`.

### Output

- A scrollbar in the right-hand column (`░` track, `█` thumb).
- Touch-drag scrolling (currently only the wheel & PgUp/PgDn scroll), plus space to page down & q to quit, as
  in `less`.
- Async commands can `await sh.sleep(ms)` for pacing (ping, ssh handshake), & Ctrl+C cancels them.

### Using the space

- **Font sizing:** test the smaller canvas font (at most 22 CSS px, with 2 or more render pixels per font pixel;
  see `textSize()` in `index.ts`) on phones, tablets & large monitors, then settle on a sizing scheme. Each pixel
  of the font gets an RGB triad where it spans a multiple of 3 render pixels, & a magenta/green pair otherwise
  (`crt.frag`), so 2× screens (most phones) now get the doubled magenta/green mask at 22 CSS px, not the triad at
  33. Options: prefer multiples of 3 within the cap (16.5 CSS px with the triad at 2×), a cap depending on screen
  size, or matching the windows' rule (`setWindowMetrics()` in `window.ts`). **Favour whichever fits the aside
  beside each place's icon** (`asideFits` in `drawView()`, `terminal.ts`): when it doesn't fit, its lines move in
  among the rest & the output gets cut off by the pager. This could even be the rule itself: the largest font
  pixel, within the cap, at which every place's aside fits. Check legibility, the brightness of the dimmed
  scanline (`vec3(0.5)` in `screenDoor()`), & colour fringes from the magenta/green mask.
- Output not tied to a destination (`help`, errors) could use most of the screen width rather than just the QR
  code's.
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

### Glyphs

Add box drawing `U+2500–257F` (trees, frames, rules) to `glyphs.json`, & `♥` if wanted.

---

## Open questions

- A guestbook (under companion) needs somewhere to store notes, which Neocities' static hosting can't provide:
  a tiny external endpoint (eg. a Cloudflare Worker + KV) or an embedded third-party guestbook. It can come last.
- Photos (traveller, garden, campfire): how many, & how large? Thumbnails should be resized/dithered at build
  time, & full-size originals might be better on GitHub Pages (as with `media/`) than in Neocities' storage.
