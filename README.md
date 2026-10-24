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
- `src/menu.ts` handles pointer input, hover & selection animations, & the labels typed after the `>>` prompt
  (eg. `ls garden`), drawn by `src/textRenderer.ts`.
- `src/destinations.ts` maps groups in the QR code SVG to the destinations they link to, & their accent colours.
- `src/palette.ts` holds colour helpers.
- `src/shaders/` contains the GLSL shaders, including the CRT (`crt.frag`) & curved monitor (`warp.frag`)
  effects.

### Assets

Assets in `src/assets/` are processed at compile time, & never deployed as-is:

- `qr.svg` (drawn in Inkscape) is parsed by `scripts/bakeQR.js` into compact module data, which is bundled
  into `index.js`. Coloured modules must be 1×1 rectangles in the "Main" layer, grouped by element; the
  background colour comes from the rectangle in the "Background" layer.
- `DejaVuSansMono.ttf` is subsetted by `scripts/subsetFont.js` to only the glyphs listed in `glyphs.json`, &
  output as `fonts/DejaVuSansMono.woff2`. Add glyphs to `glyphs.json` before using them in text.

Static files that should be deployed as-is (eg. `robots.txt`, & the 404 page `not_found.html`) go in `public/`,
& are served from the root of the site.

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

- QR code generated with Noel Friedrich's awesome [human-readable QR
  code](https://www.noel-friedrich.de/hqr/) tool; see also his [QR
  studio](https://www.noel-friedrich.de/qr/drawing/)
