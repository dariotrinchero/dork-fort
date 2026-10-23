import { createHash } from "crypto";
import { readdir, readFile } from "fs/promises";
import path from "path";

const BUILD_DIR = "build";
const API_URL = "https://neocities.org/api";
const API_KEY = process.env.NEOCITIES_API_KEY;
const UPLOAD_BATCH_SIZE = 20; // files per upload request

const isDryRun = process.argv.includes("--dry-run");

/**
 * Send request to Neocities API.
 *
 * @param endpoint API endpoint, eg. "list"
 * @param options fetch options
 * @returns parsed JSON response
 */
async function request(endpoint, options = {}) {
    const res = await fetch(`${API_URL}/${endpoint}`, {
        ...options,
        headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const json = await res.json();
    if (json.result !== "success") throw new Error(`Neocities ${endpoint} failed: ${json.message ?? JSON.stringify(json)}`);
    return json;
}

/**
 * Read all files in directory (recursively).
 *
 * @param dir directory to read
 * @param files map to which to add files, keyed by path relative to build directory
 * @returns map from path (relative to build directory, with forward slashes) to file contents
 */
async function readFiles(dir, files = new Map()) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) await readFiles(fullPath, files);
        else if (entry.isFile()) files.set(path.relative(BUILD_DIR, fullPath).replace(/\\/g, "/"), await readFile(fullPath));
    }
    return files;
}

const sha1 = data => createHash("sha1").update(data).digest("hex");

async function main() {
    if (!API_KEY) {
        console.error("NEOCITIES_API_KEY not set");
        process.exit(1);
    }

    const local = await readFiles(BUILD_DIR);
    const remote = (await request("list")).files;
    const remoteHashes = new Map(remote.filter(f => !f.is_directory).map(f => [ f.path, f.sha1_hash ]));

    // upload new & changed files
    const changed = [ ...local ].filter(([ filePath, data ]) => remoteHashes.get(filePath) !== sha1(data));
    for (let i = 0; i < changed.length; i += UPLOAD_BATCH_SIZE) {
        const batch = changed.slice(i, i + UPLOAD_BATCH_SIZE);
        if (!isDryRun) {
            const form = new FormData();
            batch.forEach(([ filePath, data ]) => form.append(filePath, new Blob([ data ]), path.basename(filePath)));
            await request("upload", { body: form, method: "POST" });
        }
        batch.forEach(([ filePath ]) => console.log(`${isDryRun ? "Would upload" : "Uploaded"}: ${filePath}`));
    }

    // delete remote files & directories absent from build (deleting a directory deletes its contents)
    const localDirs = new Set([ ...local.keys() ].flatMap(filePath =>
        filePath.split("/").slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join("/"))
    ));
    const stale = remote
        .filter(f => f.is_directory ? !localDirs.has(f.path) : !local.has(f.path))
        .map(f => f.path);
    const toDelete = stale.filter(p => !stale.some(dir => p.startsWith(`${dir}/`)));
    if (toDelete.length > 0) {
        if (!isDryRun) {
            const form = new URLSearchParams();
            toDelete.forEach(p => form.append("filenames[]", p));
            await request("delete", { body: form, method: "POST" });
        }
        toDelete.forEach(p => console.log(`${isDryRun ? "Would delete" : "Deleted"}: ${p}`));
    }

    console.log(`${isDryRun ? "[dry run] " : ""}${changed.length} uploaded, ${toDelete.length} deleted, `
        + `${local.size - changed.length} unchanged`);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
