import { execSync } from "child_process";
import { copyFileSync, cpSync, existsSync, rmSync, mkdirSync, readdirSync, statSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { context, build } from "esbuild";
import { glsl } from "esbuild-plugin-glsl";
import { bakeContent } from "./bakeContent.js";
import { bakeQR } from "./bakeQR.js";
import { subsetToGlyphSet } from "./subsetFont.js";
import { describe, validateVault } from "./validateContent.js";

const isProd = process.argv.includes("--prod");

// root of media (eg. sounds), which Neocities' free plan won't host, so production builds leave them to the repo's
// GitHub Pages site (see .github/workflows/deploy.yml), & dev builds serve them locally
const MEDIA_URL = isProd ? "https://dariotrinchero.github.io/handlebody/" : "/";

// inputs of build, whose modification times tell whether anything has changed since last build
const INPUTS = ["content", "index.html", "media", "public", "src", "eslint.config.mjs", "tsconfig.json"];

/**
 * Fingerprint inputs of build by paths, sizes & modification times of their files.
 *
 * @returns fingerprint, which changes whenever an input file is added, removed, or modified
 */
const fingerprint = () => {
    const parts = [];
    const visit = path => {
        if (!existsSync(path)) return;
        const stat = statSync(path);
        if (stat.isDirectory()) readdirSync(path).sort().forEach(name => visit(join(path, name)));
        else parts.push(`${path}:${stat.size}:${stat.mtimeMs}`);
    };
    INPUTS.forEach(visit);
    return parts.join("\n");
};

const buildOptions = {
    entryPoints: [
        "src/index.ts",
        "src/style.css", // expand if more stylesheets are added
    ],
    bundle: true,
    define: { MEDIA_URL: JSON.stringify(MEDIA_URL) },
    outdir: "build",
    inject: isProd ? [] : [ "scripts/hot-reload.js" ],
    sourcemap: !isProd,
    minify: isProd,
    plugins: [
        glsl({ minify: true }), // loads shader sources (.frag, .vert, etc.) as strings
        {
            name: "bake-qr-svg",
            setup(build) {
                // parse imported QR code SVGs into module data, bundled as JSON
                build.onLoad({ filter: /\.svg$/ }, async ({ path }) => ({
                    contents: JSON.stringify(bakeQR(await readFile(path, "utf8"))),
                    loader: "json",
                }));
            }
        },
        {
            name: "bake-content",
            setup(build) {
                // imports of "content/<folder>" give frontmatter of notes in that folder of content vault, bundled
                // as JSON (& rebuilt when notes are edited, added, or removed)
                build.onResolve({ filter: /^content\/[\w-]+$/ }, ({ path }) => ({ namespace: "content", path }));
                build.onLoad({ filter: /.*/, namespace: "content" }, async ({ path }) => {
                    const dir = resolve(path);
                    const { entries, files } = await bakeContent(dir);
                    return { contents: JSON.stringify(entries), loader: "json", watchDirs: [ dir ], watchFiles: files };
                });
            }
        },
        {
            name: "typecheck-and-copy-assets",
            setup(build) {
                // the dev server rebuilds on each request after a short idle gap (eg. for sounds, fetched lazily), so
                // checks & copying are skipped while no input has changed since the last build
                let lastInputs, lastErrors = [], unchanged = false;

                // validate content, typecheck & lint (content & lint errors only block production builds)
                build.onStart(async () => {
                    const inputs = isProd ? undefined : fingerprint();
                    unchanged = inputs !== undefined && inputs === lastInputs;
                    if (unchanged) return { errors: lastErrors };
                    lastInputs = inputs;
                    console.log(" ⟳ Rebuilding...");
                    const errors = [];
                    try {
                        execSync("tsc --noEmit --project tsconfig.json", { stdio: "inherit" });
                    } catch {
                        errors.push({ text: "TypeScript type checking failed; skipping build" });
                    }
                    try {
                        execSync("eslint 'src/**/*.ts'", { stdio: "inherit" });
                    } catch {
                        if (isProd) errors.push({ text: "ESLint linting failed; skipping build" });
                        else console.log("ESLint linting failed; building anyway...");
                    }
                    const problems = await validateVault();
                    problems.forEach(problem => console.error(describe(problem)));
                    if (problems.length > 0) {
                        if (isProd) errors.push({ text: "Content validation failed; skipping build" });
                        else console.log("Content validation failed; building anyway...");
                    }
                    lastErrors = errors;
                    return { errors };
                });

                // copy static assets & subset font to glyphs used by text renderer
                build.onEnd(async result => {
                    if (result.errors.length > 0 || unchanged) return;
                    copyFileSync("index.html", "build/index.html");
                    if (existsSync("public")) cpSync("public", "build", { recursive: true }); // served from site root
                    if (!isProd) cpSync("media", "build", { recursive: true }); // in production, served from Pages
                    mkdirSync("build/fonts", { recursive: true });
                    await writeFile(
                        "build/fonts/DepartureMono.woff2",
                        await subsetToGlyphSet("src/assets/DepartureMono-Regular.otf", "src/assets/glyphs.json")
                    );
                    console.log(" ✔ Build complete");
                });
            }
        }
    ]
};

const run = async () => {
    // clean build directory
    rmSync("build", { recursive: true, force: true });
    mkdirSync("build", { recursive: true });

    if (isProd) {
        console.log("Building in production mode");
        await build(buildOptions);
    } else {
        const ctx = await context(buildOptions);
        await ctx.watch();
        await ctx.serve({ servedir: "build" });
        console.log("Serving on http://localhost:8000");
    }
};

run();