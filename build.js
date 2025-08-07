import { execSync } from "child_process";
import { copyFileSync, cpSync, rmSync, mkdirSync } from "fs";
import { context, build } from "esbuild";
import { glsl } from "esbuild-plugin-glsl";

const isProd = process.argv.includes("--prod");

const buildOptions = {
    entryPoints: [ "src/index.ts" ],
    bundle: true,
    outfile: "build/index.js",
    sourcemap: isProd ? false : true,
    minify: isProd,
    jsx: "automatic",
    loader: {
        ".glsl": "text",
        ".vert": "text",
        ".frag": "text",
    },
    plugins: [
        glsl({ minify: true }),
        {
            name: "type-check-and-copy-assets",
            setup(build) {
                // run Typescript before building
                build.onStart(() => {
                    try {
                        execSync("tsc --noEmit --project tsconfig.json", { stdio: "inherit" });
                    } catch {
                        return { errors: [ { text: "TypeScript type check failed; skipping build." } ] };
                    }
                });

                // copy static assets
                build.onEnd(result => {
                    if (result.errors.length > 0) return;
                    copyFileSync("src/style.css", "build/style.css");
                    copyFileSync("index.html", "build/index.html");
                    cpSync("public", "build/public", { recursive: true });
                    console.log("Build complete");
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
        await build(buildOptions);
        console.log("Production build complete");
    } else {
        const ctx = await context(buildOptions);
        await ctx.watch();
        await ctx.serve({ servedir: "build" });
        console.log("Serving on http://localhost:8000");
    }
};

run();