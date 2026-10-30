[![Deploy to Neocities](https://github.com/dariotrinchero/handlebody/actions/workflows/deploy.yml/badge.svg)](https://github.com/dariotrinchero/handlebody/actions/workflows/deploy.yml)

# Handlebody

Personal (non-professional) website, hosted on Neocities at [handlebody.neocities.org](https://handlebody.neocities.org).

The landing page is a pixel-art QR code, rendered with WebGL2 through a CRT shader. Elements of the artwork
are interactive, & link to the different parts of the site.

## Compiling for development

1. Install requisite node packages using
   ```bash
   npm install
   ```

2. Launch dev server using
   ```bash
   npm run dev
   ```

The dev server (on http://localhost:8000) will watch source files, recompile upon updates, & reload the
webpage in the browser. Changes to the build scripts themselves require restarting the dev server.

## Project structure

- `src/index.ts` sets up the canvas & animation loop.
- `src/renderPipeline.ts` runs sequences of render passes (WebGL programs), allocating the frame buffers
  passed between them.
- `src/qrRenderer.ts` draws the QR code, & finds which interactive region lies under a given point.
- `src/menu.ts` handles pointer input, & the hover & selection animations of the QR code.
- `src/terminal.ts` handles the `>>` prompt (typed into through a hidden `<input>`), the commands suggested by
  hovering, & command output, all drawn by `src/textRenderer.ts`.
- `src/window.ts` opens text-mode windows (DOM, styled in `src/style.css` to match the CRT) over the screen, whose
  behaviour follows from classes in their markup (eg. `.index` & `.filter` for a list filtered by
  `src/fuzzy.ts`), & `src/route.ts` keeps what is shown (eg. `#campfire/cookbook`) in the URL.
- `src/campfire.ts` holds the contents of the campfire: its menu & windows (placeholders, for now).
- `src/whoami.ts` holds the contents of whoami: a neofetch-style card beside the nametag.
- `src/garden.ts` holds the contents of the garden of its own (so far, only its description).
- `src/pages.ts` adds pages of the content vault with menu entries of their own to the menus of their destinations.
- `src/shell.ts` defines the commands: their syntax highlighting, completion, & what they do.
- `src/destinations.ts` maps groups in the QR code SVG to the destinations they link to, with their icons, commands,
  aliases, accent colours, & sounds (played by `src/ambience.ts`).
- `src/palette.ts` holds text colours & colour helpers.
- `src/shaders/` contains the GLSL shaders, including the CRT (`crt.frag`) & curved monitor (`warp.frag`)
  effects, whose parameters are set by `src/crt.ts` (screen modes) & `src/warp.ts`.

### Assets

Assets in `src/assets/` are processed at compile time, & never deployed as-is:

- `qr.svg` (drawn in Inkscape) is parsed by `scripts/bakeQR.js` into compact module data, which is bundled
  into `index.js`. Coloured modules must be 1×1 rectangles in the "Main" layer, grouped by element; the
  background colour comes from the rectangle in the "Background" layer.
- `DepartureMono-Regular.otf` is subsetted by `scripts/subsetFont.js` to only the glyphs listed in `glyphs.json`,
  & output as `fonts/DepartureMono.woff2`. Add glyphs to `glyphs.json` before using them in text. Its licence is
  deployed alongside it, from `public/fonts/DepartureMono-OFL.txt`.

Static files that should be deployed as-is (eg. `robots.txt`, & the 404 page `not_found.html`) go in `public/`,
& are served from the root of the site.

Media (for now, the ambient sounds in `media/sounds/`) go in `media/`, & are **not** deployed to Neocities, whose
free plan won't host audio. They are served instead from this repo's GitHub Pages site (see
[Hosting media on GitHub Pages](#hosting-media-on-github-pages)). Code refers to them by paths relative to `media/`
(eg. `sounds/garden.mp3`), prefixed with `MEDIA_URL`, which `scripts/build.js` defines at compile time: the Pages
site in production builds, & the site root in dev builds (which copy `media/` into `build/`, so they work offline).

## Content

The site's writing, reading lists, films & the like live in `content/`, an Obsidian vault, whose notes are baked
into the site at build time by `scripts/bakeContent.js`. `content/schema.yaml` gives the type of every field of
every collection, & `scripts/validateContent.js` checks each note against it: problems fail production builds
(naming the file & field), & only warn in dev. The templates in `content/Templates/` give each collection's
fields (in order) & defaults, & `draft: true` keeps any note off the site.

Folders go by type, & the bake script maps them to destinations, so content can move between destinations
without moving files:

| Folder | Holds | Destination |
|---|---|---|
| `novels/` | literature (incl. plays & short stories) | moon-and-stars |
| `nonfiction/` | textbooks, books & papers | realm-of-forms |
| `films/` | films, series & anime | moon-and-stars |
| `games/`, `boardgames/` | video games; board, card & other tabletop games | moon-and-stars |
| `adventures/` | one per outing | traveller |
| `garden/` | notes on iNaturalist observations | garden |
| `blog/` | blog posts, dated | realm-of-forms |
| `pages/` | standalone pages (packlist, wishlist) & ranked lists | each names its own `destination` |
| `attachments/` | `covers/`, `posters/`, `photos/` (Obsidian pastes here), `gpx/` | — |

Pages may give themselves an entry in the menu of their destination, with `menu:` (its label, eg. `eek! a rat!!`) &
`commands:` (names which open it while the destination is shown, besides its slug, eg. `[eek, rat]`); `src/pages.ts`
adds these to the menus. Bodies of pages (alone among notes) are rendered to HTML at build time by
`scripts/renderMarkdown.js`, which understands Obsidian's wikilinks (linking to windows of notes) & embeds (eg.
`![[baraka.jpg]]`, deployed at their paths in the vault, eg. `attachments/photos/baraka.jpg`).

The repo is public, so all of `content/` is visible on GitHub, even what the site leaves out.

Filenames are slugs, which are also the URLs (`build/<dest>/<slug>.html`), so they are unique, shell- &
URL-safe, & stable when a title is corrected:
- **novels:** `<title>-<surname>`, without any subtitle (`the-cave-saramago`).
- **films:** `<title>-<year>` (`after-hours-1985`).
- **nonfiction:** the item's citekey in Zotero (eg. `kripkeNamingNecessity1980`), read from Zotero, never
  guessed.
- **adventures & garden:** `<date>-<place>` (`2026-10-01-table-mountain`).
- **blog & pages:** `<title>`.

Every note has `title:` (in full) & `aliases:` (the short title), so typing `[[The Cave` in Obsidian inserts
`[[the-cave-saramago|The Cave]]`.

```bash
npm run check   # validate the vault alone
npm test        # tests of the validator (also run in CI, before building)
```

[`handle`](tools/handle/README.md), in `tools/handle/`, is a terminal tool for keeping the reading & watching lists:
adding things (from Open Library, Zotero & Wikidata), marking them started, finished or dropped, rating them, &
editing them, by the same rules as the build.

## Deploying

There is seldom a need to deploy the site manually, because pushing changes to the `main` branch
triggers a GitHub action (defined in `.github/workflows/deploy.yml`), which deploys the media to GitHub Pages (see
below), then executes the following steps automatically.

1. Compile for production using
   ```bash
   npm run build
   ```

2. Publish to Neocities by setting the `NEOCITIES_API_KEY`
   [environment variable](https://neocities.org/settings/handlebody#api_key) (note the leading space
   to avoid storing the secret key in terminal history), then running the deployment script
   ```bash
    export NEOCITIES_API_KEY="..."
   npm run publish
   ```

The deployment script syncs the site with the `build` directory: it uploads new & changed files, & **deletes
any remote files that are not in the build** (including files added through the Neocities editor). To see
what would change without changing anything, run
```bash
npm run publish -- --dry-run
```

### Hosting media on GitHub Pages

Besides the one user site (`dariotrinchero.github.io`, from the repo of that name, which hosts the professional
site), GitHub Pages hosts a *project site* for every other repo that turns it on, served at
`https://dariotrinchero.github.io/<repo>/`. This repo's serves the contents of `media/` at
https://dariotrinchero.github.io/handlebody/ (eg. `…/handlebody/sounds/garden.mp3`), & has nothing to do with the
professional site's build, besides owning the `/handlebody/` path of its domain.

The same GitHub action deploys it, in a job that runs first, so that the site never links to media not yet
uploaded. Pages must be turned on once, by setting the source under the repo's **Settings → Pages** to **GitHub
Actions**. Things to know:

- Pages sends `Access-Control-Allow-Origin: *`, which matters: sounds play through a Web Audio gain node (for fades,
  & volume on iOS), which outputs only silence for audio from another origin fetched without CORS. So
  `src/ambience.ts` sets `crossOrigin = "anonymous"` on its audio elements; hosts that don't send CORS headers
  (eg. GitHub release assets) won't do.
- Pages caches files for about 10 minutes, so a sound replaced under the same name may take that long to change;
  give it a new name to change it at once.
- If the user site is ever given a custom domain, project sites move to it (eg. `example.com/handlebody/`), &
  `MEDIA_URL` in `scripts/build.js` must follow.
- Limits: 1 GB published per site, & a soft limit of 100 GB of bandwidth a month; the repo must stay public.

## Credits

- Book data & covers from [Open Library](https://openlibrary.org/); film, series, game & book series data from
  [Wikidata](https://www.wikidata.org/) (CC0), both fetched by `handle` as entries are added
- Text set in Helena Zhang's [Departure Mono](https://departuremono.com/), under the SIL Open Font License (see
  `public/fonts/DepartureMono-OFL.txt`)
- QR code generated with Noel Friedrich's awesome [human-readable QR
  code](https://www.noel-friedrich.de/hqr/) tool; see also his [QR
  studio](https://www.noel-friedrich.de/qr/drawing/)
