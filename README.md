[![Deploy to Neocities](https://github.com/dariotrinchero/dork-fort/actions/workflows/deploy.yml/badge.svg)](https://github.com/dariotrinchero/dork-fort/actions/workflows/deploy.yml)

# Dork Fort

Personal (non-professional) website for hosting on Neocities.

## Compiling for development

1. Install requisite node packages using
   ```bash
   npm install
   ```

2. Launch dev server using
   ```bash
   npm run dev
   ```

The dev server will watch source files and recompile upon updates, but will not hot-reload the
webpage in the browser.

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