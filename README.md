[![Deploy to Neocities](https://github.com/dariotrinchero/dork-fort/actions/workflows/deploy.yml/badge.svg)](https://github.com/dariotrinchero/dork-fort/actions/workflows/deploy.yml)

# Dork Fort

Personal (non-professional) website for hosting on Neocities.

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
- `src/shell.ts` defines the commands: their syntax highlighting, completion, & what they do.
- `src/destinations.ts` maps groups in the QR code SVG to the destinations they link to, with their icons, commands,
  aliases, & accent colours.
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

## Content

The site's writing, reading lists, films & the like live in `content/`, an Obsidian vault, whose notes are baked
into the site at build time by `scripts/bakeContent.js` (see `TODO.md` for how it's organised).
`content/schema.yaml` gives the type of every field of every collection, & `scripts/validateContent.js` checks
each note against it: problems fail production builds (naming the file & field), & only warn in dev.

```bash
npm run check   # validate the vault alone
npm test        # tests of the validator (also run in CI, before building)
```

[`dork`](tools/dork/README.md), in `tools/dork/`, is a terminal tool for keeping the reading & watching lists:
marking things started, finished or dropped, rating them, & editing them, by the same rules as the build.

## Deploying to Neocities

There is seldom a need to deploy the site manually, because pushing changes to the `main` branch
triggers a GitHub action (defined in `.github/workflows/deploy.yml`), which executes the following
steps automatically.

1. Compile for production using
   ```bash
   npm run build
   ```

2. Publish to Neocities by setting the `NEOCITIES_API_KEY`
   [environment variable](https://neocities.org/settings/dork-fort#api_key) (note the leading space
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

## Credits

- Text set in Helena Zhang's [Departure Mono](https://departuremono.com/), under the SIL Open Font License (see
  `public/fonts/DepartureMono-OFL.txt`)
- QR code generated with Noel Friedrich's awesome [human-readable QR
  code](https://www.noel-friedrich.de/hqr/) tool; see also his [QR
  studio](https://www.noel-friedrich.de/qr/drawing/)
