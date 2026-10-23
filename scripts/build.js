import { execSync } from "child_process";
import { copyFileSync, cpSync, existsSync, rmSync, mkdirSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { context, build } from "esbuild";
import { glsl } from "esbuild-plugin-glsl";
import { bakeQR } from "./bakeQR.js";
import { subsetToGlyphSet } from "./subsetFont.js";

const isProd = process.argv.includes("--prod");

const buildOptions = {
    entryPoints: [
        "src/index.ts",
        "src/style.css", // expand if more stylesheets are added
    ],
    bundle: true,
    outdir: "build",
    inject: isProd ? [] : [ "scripts/hot-reload.js" ],
    sourcemap: !isProd,
    minify: isProd,
    loader: {
        ".glsl": "text",
        ".vert": "text",
        ".frag": "text",
    },
    plugins: [
        glsl({ minify: true }),
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
            name: "typecheck-and-copy-assets",
            setup(build) {
                // typecheck & lint (lint errors only block production builds)
                build.onStart(() => {
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
                    return { errors };
                });

                // copy static assets & subset font to glyphs used by text renderer
                build.onEnd(async result => {
                    if (result.errors.length > 0) return;
                    copyFileSync("index.html", "build/index.html");
                    if (existsSync("public")) cpSync("public", "build/public", { recursive: true });
                    mkdirSync("build/fonts", { recursive: true });
                    await writeFile(
                        "build/fonts/DejaVuSansMono.woff2",
                        await subsetToGlyphSet("src/assets/DejaVuSansMono.ttf", "src/assets/glyphs.json")
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