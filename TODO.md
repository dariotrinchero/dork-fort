# Dork Fort Neocities Project

## Deferred from code audit

- `warp.frag`: write `curvedMonitor()` as the same one-line formula as `warpUV()` in `warp.ts`, instead of the
  general-purpose `easeInQuart(t, b, c, d)` (pending explanation).
- `textRenderer.ts`: replace the `Map<"x,y", CharTile>` grid (& `parseKey()`) with a flat array indexed
  `y * cols + x`, as part of the shell work.
- `renderPipeline.ts`: `SeriesPass.outputDims` is unused. Keep it only if a lower-resolution pass (eg. half-res
  bloom/glow) is planned; otherwise remove it, along with its part of the plan key.

## Destinations

### Principle: the canvas is the *shell*, HTML pages are the *documents*

Long-form reading (notes, travel posts, galleries) inside a WebGL text grid would mean rebuilding scrolling,
links, images, text selection, & accessibility. So split by content type:

- **In-canvas (the shell):** navigation, short outputs, listings, bios, easter eggs. Each destination's command
  prints a *preview/index* in the space freed when its icon slides to the top. That is exactly what the TODO
  already sketches.
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
| `sort {moon-and-stars}` | **proposal: the curated lists** (books, music, films, tools, places) | `sort` *is* ranking, so the items print **jumbled, then visibly sort themselves** (swaps flash) into your ranking. This splits the garden's "abstract" half off into a destination whose verb already fits. | one page per list |
| `touch {campfire}` | cooking & recipes | `touch: campfire: too hot to touch. sit down instead?`, the campfire modules flicker (noise on its hover intensity), then the recipes. A `make` easter egg: `make pancakes` "builds" the recipe like a Makefile target (`cc flour.o eggs.o milk.o -o pancakes`). | recipe pages: ingredients as clickable `[ ]` checkboxes (saved locally, so they're useful while cooking), a `--serves 4` scaler, & `sleep 10m` steps that start a countdown timer when clicked |
| `ping {companion}` | **proposal: people & company**: friends' sites (blogroll / webring), a guestbook, & contact | real-looking ping lines, one per ~400 ms, *each one a friend's site*: `64 bytes from wren.neocities.org: icmp_seq=3 time=48 ms`, ending in stats (`0% packet loss — all friends alive`), then `leave a note? (y/n)` for the guestbook. **Bonus:** the chicken itself is a tiny tamagotchi (`feed chicken`, `pet chicken`, its mood saved in `localStorage`). | external links; guestbook |

### Page look & feel

The pages read like a terminal pager that grew some typography:

```
>> cat garden/on-dithering.md                              ~ / garden /
──────────────────────────────────────────────────────────────────────
## On dithering
2026-09-14 · 6 min · #shaders #pixel-art

Body text in DejaVu Sans Mono, measure capped at ~72ch (an 80-column
terminal, less margins). Links render as [bracketed text] in the
section's accent colour; `## headings` keep their hash marks in dim.

┌─ shader.frag ───────────────────────────┐
│ code blocks framed in box-drawing chars │
└─────────────────────────────────────────┘

[cd ..]  [cd ~]
──────────────────────────────────────────────────────────────────────
```

- **Palette:** the same off-white `LABEL_COLOR` on the QR background colour, & `--accent` per section, taken from
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

### Input mechanics

- A **hidden `<input>`** receives the keystrokes (xterm.js does the same). This gets the mobile soft keyboard,
  IME, paste, & autocorrect suppression for free:
  `autocomplete=off autocapitalize=off spellcheck=false enterkeyhint=go aria-label="command"`, with
  `font-size ≥ 16px` so iOS doesn't zoom on focus. The canvas draws `input.value` & a block cursor at
  `selectionStart`.
- **Desktop:** any printable keydown focuses the input, so typing just works. **Touch:** tapping the prompt
  line focuses it.
- **Keys:** Enter runs. ↑/↓ walk history (kept in `localStorage`, in try/catch). Tab completes, & a double Tab
  lists candidates. → accepts the ghost suggestion. Esc clears the input, or deselects if it is already empty.
  Ctrl+C aborts a running command (prints `^C`). Ctrl+L clears.
- **Discoverability:** on first visit, a ghost-dim hint under the prompt reads
  `type 'help', or tap the picture`. It disappears after the first interaction.

### The menu and the shell are one system

- **Hover = autosuggestion** (fish-style). While the input is empty, hovering types the destination's command
  as now. Clicking is "Enter on that suggestion", so every click *teaches the command language*.
- **Typing lights up the picture.** As you type `ls gar`, the garden region hover-highlights live, with ghost
  text `den` shown dim (Tab or → accepts). This reuses the existing hover-intensity path: the shell sets
  `hovered` from its parse.
- Once the input is non-empty, hover still highlights the picture but never overwrites what the user typed.
- Running a destination command plays the existing selection animation. `cd ~`, `cd ..`, `exit` (inside a
  destination), & Esc reverse it.

### Commands

**Core** (`help` lists these, each in its own colour): `help`, `ls` (with no args, lists the destinations as
coloured directories, `garden/  traveller/  campfire/ …`, so it doubles as a text menu), `cd <dest>`,
`open <dest>`, `clear`, `history`, `man <cmd>`, `echo`, `date`, `uptime` (since the site launched).

**Navigation aliases:** each destination is reachable by its canonical command (`ls garden`), its bare name
(`garden`), its group name (`chicken`, `moon`), & friendly aliases (`travel`, `notes`, `friends`, `about`,
`gallery`, `projects`). The table is derived from `DESTINATIONS` plus an `aliases` field. Unknown words get
**did-you-mean** (edit distance ≤ 2).

**Easter eggs** (left out of `help`, but `help --all` hints that there are more):

- `sudo …` → `dario is not in the sudoers file. This incident will be reported.` (red flash);
  `sudo make me a sandwich` → `Okay.` (xkcd 149)
- `rm -rf /` → the QR modules **crumble & fall** column by column (per-column offsets in `qr.frag`), then
  `restoring from backup…` & they reassemble
- `touch grass` → `you went outside. +10 HP` → navigates to the garden
- `cat` (no args) → an ASCII cat; `sort` (no args) → `everything in its right place.`
- `who am i` (with spaces) → `a question for the realm of forms…` (a hint at `ssh`)
- `degauss` → the classic CRT degauss wobble (a hue/UV wobble burst in `crt.frag`)
- `theme amber|green|white` → monochrome phosphor modes (luminance × tint in `crt.frag`); `crt off` → a plain,
  readable mode (an accessibility feature disguised as a toy)
- `exit` at the top level → the power-off animation, then `[ press any key ]` to power back on
- `vim` → `you are now trapped.`, & `:q` actually frees you; `emacs` → `M-x butterfly` (xkcd 378)
- `xyzzy` → `Nothing happens.`; `fortune` → a rotating aphorism (Plato-flavoured?); `cmatrix` → glyph rain for
  5 s in the accent colours; the Konami code → the QR goes rainbow
- `uname -a` → `DorkFort 1.0 campfire-kernel #1 SMP PREEMPT_DYNAMIC dsh x86_64`

### Syntax highlighting

Extend the existing rule ("text in braces takes the destination's accent") into a rule with meaning: **accent
hues are reserved for places.** A word glows garden-pink only if it refers to the garden. Everything else uses
a small neutral palette, defined once in a new `palette.ts`:

| Token | Colour |
|---|---|
| prompt `>>`, known command | `fg` (existing `LABEL_COLOR`) |
| unknown command, while typing | `error` (a red distinct from the campfire orange), fish-style live feedback |
| argument / path naming a destination | that destination's boosted accent; for paths, the first segment decides (`garden/tomatoes.md`) |
| flags `-la`, operators `\| > &&`, other args | `dim` (≈ 0.6 × fg) |
| quoted strings | `fg`, with the quotes in `dim` |
| ghost suggestion, hints | `ghost` (≈ 0.35 × fg) |

The tokenizer is a whitespace split with quote handling that returns `{ text, kind, span }`. The highlighter
maps a kind to a `Segment`. It renders the same everywhere: in the prompt, in `history`, & in `help`.

### Keeping output on screen

**One rule makes this tractable:** any command, not just a destination, frees the QR area by generalising the
existing selection animation.

- **Destination command:** as now. The icon slides to the top, the echo line (`>> ls garden`) sits under it,
  & the **output pane** fills the rest.
- **Other commands** (`help`, eggs): the whole QR **dims to ~15%** (`uDismiss` with no selected region),
  leaving a ghostly backdrop, & the echo line slides to the top of the QR rect. The pane is the full QR rect.
- **Pane bounds:** the left/right edges of the QR rect. The bottom is the screen bottom, less padding, less one
  row for the **live prompt, pinned at the bottom**. On phones in portrait, the pane can therefore run below
  the QR rect into the free space.

Inside the pane:

- Output is stored as **unwrapped styled lines** (`Segment[][]`) & **word-wrapped** to the pane width at draw
  time, so resizing re-flows it.
- Each command **replaces** the pane; there is no endless log burying the artwork. `history` keeps the record.
- If the output is taller than the pane, it becomes a `less`-style pager: a status line
  `-- more (40%) --  space ↓ · q quit`, a scrollbar in the right-hand column built from glyphs the atlas
  already has (`░` track, `█` thumb), & wheel, touch-drag, PgUp/PgDn, & space all scroll.
- Output **prints at a typewriter rate**, a few lines per frame, for the terminal feel. Async commands can
  `await sh.sleep(ms)` for pacing (ping, ssh handshake), & Ctrl+C cancels them.

```
   ┌──────────────────────────┐        ┌──────────────────────────┐
   │      [garden icon]       │        │ ░░░░ QR dimmed to 15% ░░ │
   │ >> ls garden             │        │ >> help                  │
   │ garden/                  │        │ ls      list places      │
   │ ├── seedlings/           │        │ cd      go somewhere     │
   │ │   ├── on-dithering  3d │        │ garden  ls garden        │
   │ │   └── shader-notes  2w █        │ …                        █
   │ └── evergreen/           ░        │ -- more (60%) --         ░
   └──────────────────────────┘        └──────────────────────────┘
     >> █                                >> █
```

### Accessibility

- A visually hidden `<nav>` lists real links to the destination pages, plus a `<noscript>` fallback.
- The pane's text is mirrored into an `aria-live="polite"` region.
- The `crt off` mode, as above.

---

## Architecture & phasing

### Modules (flat, matching the current layout)

- `palette.ts` (exists, holding `parseHex` so far): add the colour tokens, & the destination accents, boosted
  once.
- `shell.ts`: tokenizer, highlighter, completion, did-you-mean, dispatch, session state (the prompt string for
  the `ssh` sub-shell), & history.
- `commands.ts`: the command table:
  `{ name, aliases?, summary? /* omitted = hidden egg */, run(args, sh) }`. The destination commands are
  generated from `DESTINATIONS`.
- `terminal.ts`: owns the hidden `<input>`, the prompt line, the echo line, & the output pane (wrapping, pager,
  typewriter, scrollbar), & writes all of it into `TextRenderer`. The typewriter that is now in `menu.ts`
  moves here.
- `menu.ts`: slims back to pointer → region, hover, & selection. It exposes `select(i)`, `deselect()`,
  `highlight(i)` & emits `suggest(cmd)` / `run(cmd)`.
- `textRenderer.ts`: a dense grid (see the deferred audit items) & a `printLine(row, segments)`.
- `scripts/buildPages.js` + `src/pages.css` + `content/`: the Markdown → HTML pages & `contentIndex.json`.
- `Segment` moves to `types/global.d.ts`, since the shell, terminal, & menu all speak `Segment[]`.

### Phases (each one shippable)

1. **Shell core:** the hidden input, editing, history, tokenizer + highlighting, the command table (`help`,
   `ls`, `cd`, `clear`, destination commands + aliases), & the menu ↔ shell coupling (hover suggests, typing
   highlights, click = Enter).
2. **Output pane:** the generalised "free the QR area" layout, wrapping, pager + scrollbar, typewriter
   printing, & async commands with Ctrl+C.
3. **Content:** the Markdown build, the page template + CSS theme, the per-destination in-canvas previews,
   the power-off/on transitions, hash routing, & the 404-as-shell.
4. **Delight:** the easter eggs & shader effects (degauss, themes, crumble, cmatrix, the ssh sub-shell, the
   campfire flicker).

### Glyphs to add to `glyphs.json`

Box drawing `U+2500–257F` (trees, frames, rules). Arrows `U+2190–2193`. `·`, `…`, `♥` if wanted.

---

## Open questions

- Does `moon-and-stars` as the home for curated lists suit you (which leaves the garden as purely fungi &
  frogs)? And does companion as people/guestbook (+ the pet chicken) suit you?
- A guestbook (under companion) needs somewhere to store notes, which Neocities' static hosting can't provide.
  The options are a tiny external endpoint (e.g. a Cloudflare Worker + KV) or an embedded third-party
  guestbook on the companion *page*. It can come last.
- Photos (traveller, garden): how many, & how large? Thumbnails should be resized/dithered at build time, &
  keeping full-size originals out of the repo may matter for Neocities' storage limits.
- Should pages carry a mini prompt at the bottom (sharing `shell.ts` with a DOM renderer), or stay plain HTML
  with `cd ..` links? I'd start plain, since the shell's output being `Segment[]` keeps the option open.
