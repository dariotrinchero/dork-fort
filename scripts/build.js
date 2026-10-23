import { execSync } from "child_process";
import { copyFileSync, cpSync, existsSync, rmSync, mkdirSync } from "fs";
import { context, build } from "esbuild";
import { glsl } from "esbuild-plugin-glsl";

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

                // copy static assets
                build.onEnd(result => {
                    if (result.errors.length > 0) return;
                    copyFileSync("index.html", "build/index.html");
                    if (existsSync("public")) cpSync("public", "build/public", { recursive: true });
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