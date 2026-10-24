# Dork Fort Neocities Project

## Deferred from code audit

- `warp.ts`/`warp.frag`: `uCutoff` & `uMagnitude` only ever act as their product (the scale is
  `1 + cutoff·magnitude·(t⁴ − 1)`), so could become a single "strength" parameter.
- `renderPipeline.ts`: `SeriesPass.outputDims` is unused. Keep it only if a lower-resolution pass (eg. half-res
  bloom/glow) is planned; otherwise remove it, along with its part of the plan key.

## Destinations

### Principle: the canvas is the *shell*, HTML pages are the *documents*

Long-form reading (notes, travel posts, galleries) inside a WebGL text grid would mean rebuilding scrolling,
links, images, text selection, & accessibility. So split by content type:

- **In-canvas (the shell):** navigation, short outputs, listings, bios, easter eggs. Each destination's command
  prints a *preview/index* in the space freed when its icon slides to the top.
- **Real HTML pages (the documents):** generated at build time from Markdown, `content/<dest>/*.md` →
  `build/<dest>/<slug>.html`, plus a generated `contentIndex.json` bundled into `index.js` so `ls garden` can
  list real entries. Real URLs work with deep links, without WebGL, with Neocities & search engines, & with
  screen readers.

### Per-destination concepts

These follow your stated use cases. The ideas for companion, and for splitting up the garden, are mine.

| Command | Content | In-canvas output | Leads to |
|---|---|---|---|
| `ssh {realm-of-forms}` | technical blog + link to the professional site | fake host-key prompt: `The authenticity of host 'realm-of-forms (∞)' can't be established… (yes/no)?` → type/tap `yes` → **sub-shell** with prompt `plato@realm-of-forms:~$` in its purple accent. Its `ls` lists posts (newest first, with tags); `open work` / `ssh work` gives a `you are leaving the fort…` confirmation, then follows the professional-site link. `exit` → `Connection closed. You return to the cave.` The ssh metaphor ("connecting to another machine") neatly marks the personal/professional boundary. | blog post pages; external professional site |
| `cat {traveller}` | adventures: photos, climbing / running / camping logs | a **logbook**, one line per outing: `2026-09-12 ▲ climb  Table Mtn  6b+ ×4`, `2026-09-20 ↝ run  21.1 km 1:48 ▁▂▄▆█▆▄▂▁`, with **elevation sparklines** in `▁▂▃▄▅▆▇█`, which `glyphs.json` already contains. Flags filter it (`cat traveller --climb`), & the flags highlight as flags. | trip reports with photo galleries & route/elevation details |
| `{whoami}` | general about | **neofetch**: `dario@dork-fort`, `OS: DorkFort 1.0`, `Uptime: N years`, `Shell: dsh`, `Hobbies: climbing, cooking, fungi…`, then a swatch row of the 7 accent colours in `█` blocks | stays in canvas (maybe one about page for the long version) |
| `ls {garden}` | mushrooms & frogs: a **field guide** | `tree` listing (`├──`, `└──`) of beds: `fungi/`, `frogs/`, `other-critters/`, each specimen with the date found | specimen pages styled as field-guide cards: dithered photo + a `genus · found · where · notes` block |
| `sort {moon-and-stars}` | the curated lists (books, music, films, tools, places) | `sort` *is* ranking, so the items print **jumbled, then visibly sort themselves** (swaps flash) into your ranking. This splits the garden's "abstract" half off into a destination whose verb already fits. | one page per list |
| `touch {campfire}` | cooking & recipes | `touch: campfire: too hot to touch. sit down instead?`, the campfire modules flicker (noise on its hover intensity), then the recipes. A `make` easter egg: `make pancakes` "builds" the recipe like a Makefile target (`cc flour.o eggs.o milk.o -o pancakes`). | recipe pages: ingredients as clickable `[ ]` checkboxes (saved locally, so they're useful while cooking), a `--serves 4` scaler, & `sleep 10m` steps that start a countdown timer when clicked |
| `ping {companion}` | **proposal: people & company**: friends' sites (blogroll / webring), a guestbook, & contact | real-looking ping lines, one per ~400 ms, *each one a friend's site*: `64 bytes from wren.neocities.org: icmp_seq=3 time=48 ms`, ending in stats (`0% packet loss — all friends alive`), then `leave a note? (y/n)` for the guestbook. **Bonus:** the chicken itself is a tiny tamagotchi (`feed chicken`, `pet chicken`, its mood saved in `localStorage`). | external links; guestbook |

### Page look & feel

The pages read like a terminal pager that grew some typography:

```
>> cat garden/on-dithering.md                              ~ / garden /
──────────────────────────────────────────────────────────────────────
## On dithering
2026-09-14 · 6 min · #shaders #pixel-art

Body text in Departure Mono, measure capped at ~72ch (an 80-column
terminal, less margins). Links render as [bracketed text] in the
section's accent colour; `## headings` keep their hash marks in dim.

┌─ shader.frag ───────────────────────────┐
│ code blocks framed in box-drawing chars │
└─────────────────────────────────────────┘

[cd ..]  [cd ~]
──────────────────────────────────────────────────────────────────────
```

- **Palette:** the same off-white `FG` (see `palette.ts`) on the QR background colour, & `--accent` per section, taken from
  `destinations.ts`. The build emits the CSS variables from that same source, so colours never drift.
- **CRT in CSS, not WebGL:** a fixed overlay with a scanline `repeating-linear-gradient` & a vignette
  `radial-gradient`, a soft `text-shadow` glow, & a ±0.5px red/blue shadow pair for chromatic aberration. No
  warp. It matches the canvas closely enough and stays readable. Respect `prefers-reduced-motion`.
- **Images:** `image-rendering: pixelated`, optionally dithered at build time to match the pixel art.
- **Fonts:** pages need more glyphs than the canvas subset (`’ “ ” — é …`). Build a second, wider subset
  for pages rather than bloating the canvas atlas.

### Transitions & routing

- **Leaving home:** a CRT power-off animation on the canvas: the picture squashes to a bright horizontal line,
  then to a dot, then fades. This is one `uPower` uniform in `warp.frag`/`crt.frag`, taking ~400 ms, after
  which `location.assign()` runs.
- **Arriving on a page:** a CSS power-on (`scaleY` 0.005 → 1, with a brightness flash).
- **In-canvas state in the URL:** selecting pushes `#garden` & deselecting pops it, so the browser back button
  deselects. `cd ..` from a note lands on `/#garden`, with the garden already selected & its listing shown.
- **404 page as a joke that works:** `not_found.html` boots the same app, & the shell "runs" the bad path:
  `>> cd /gardn/tomatos` → `dsh: no such destination: gardn` → `did you mean garden?` (clickable).

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
like `chicken`; `notes`, `friends`, `gallery`, `projects`).

**Easter eggs** (left out of `help`, but `help --all` hints that there are more):

- `sudo` (done) could also flash red; `sudo make me a sandwich` → `Okay.` (xkcd 149)
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

### Syntax highlighting

- Paths naming a destination take its accent from their first segment (`garden/tomatoes.md`).
- A quote-aware tokenizer: quoted strings in `fg`, with the quotes in `dim`.

### Output

- A scrollbar in the right-hand column, built from glyphs the atlas already has (`░` track, `█` thumb).
- Touch-drag scrolling (currently only the wheel & PgUp/PgDn scroll), plus space to page down & q to quit, as
  in `less`.
- Output **prints at a typewriter rate**, a few lines per frame, for the terminal feel. Async commands can
  `await sh.sleep(ms)` for pacing (ping, ssh handshake), & Ctrl+C cancels them.

### Using the space

The large, grid-aligned font leaves few columns across the QR code, so:

- Output not tied to a destination (`help`, errors), shown over the faded QR code, could use most of the screen
  width rather than just the QR code's.
- On phones in portrait, output could run into the free space below the QR code (with the prompt at the bottom).
- `columns()` could move the right column onto its own (indented) line when it would be too narrow.
- Tighter wording, eg. "places (tap the picture, or type):" → "places:", & "go back (or press esc)" → "go back
  (esc)"; likewise for the hint & placeholder messages.

### CRT corner effects

- Misconvergence: colour separation (now uniform) growing towards the edges & corners.
- Maybe a faint warm purity blotch in a corner, as from a magnetised shadow mask (for `degauss` to clear).

### Accessibility

- A visually hidden `<nav>` lists real links to the destination pages, plus a `<noscript>` fallback.
- The output is mirrored into an `aria-live="polite"` region.

---

## Architecture & phasing

### Modules

- `scripts/buildPages.js` + `src/pages.css` + `content/`: the Markdown → HTML pages & `contentIndex.json`.
- Session state in `shell.ts` for the `ssh` sub-shell (its prompt string & commands).

### Phases (each one shippable)

1. **Shell, continued:** the input, command, highlighting, & output items above (except the eggs).
2. **Content:** the Markdown build, the page template + CSS theme, the per-destination in-canvas previews,
   the power-off/on transitions, hash routing, & the 404-as-shell.
3. **Delight:** the easter eggs & shader effects (degauss & CRT corner effects, crumble, cmatrix, the ssh
   sub-shell, the campfire flicker).

### Glyphs to add to `glyphs.json`

Box drawing `U+2500–257F` (trees, frames, rules). Arrows `U+2190–2193`. `·`, `…`, `♥` if wanted. Departure Mono
has all of these.

---

## Open questions

- Does companion as people/guestbook (+ the pet chicken) suit you?
- A guestbook (under companion) needs somewhere to store notes, which Neocities' static hosting can't provide.
  The options are a tiny external endpoint (e.g. a Cloudflare Worker + KV) or an embedded third-party
  guestbook on the companion *page*. It can come last.
- Photos (traveller, garden): how many, & how large? Thumbnails should be resized/dithered at build time, &
  keeping full-size originals out of the repo may matter for Neocities' storage limits.
- Should pages carry a mini prompt at the bottom (sharing `shell.ts` with a DOM renderer), or stay plain HTML
  with `cd ..` links? I'd start plain, since the shell's output being `Segment[]` keeps the option open.
