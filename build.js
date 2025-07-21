import { execSync } from "child_process";
import { build } from "esbuild";
import { copyFileSync } from "fs";
import { watch } from "chokidar";

const rebuild = async () => {
    try {
        execSync("tsc --noEmit --project tsconfig.json", { stdio: "inherit" });

        await build({
            entryPoints: [ "src/index.ts" ],
            bundle: true,
            outfile: "build/index.js",
            sourcemap: true,
            jsx: "automatic",
            logLevel: "silent",
            loader: {
                ".glsl": "text",
                ".vert": "text",
                ".frag": "text",
            }
        });

        // copy CSS manually
        copyFileSync("src/style.css", "build/style.css");

        console.log("Build complete");
    } catch (e) {
        console.error("Build error:", e);
    }
};

rebuild();

watch("src", { ignoreInitial: true }).on("all", async (_, path) => {
    console.log(`Rebuilding due to change in ${path}`);
    await rebuild();
});
