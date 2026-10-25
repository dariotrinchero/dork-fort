/**
 * Compile-time reader turning a folder of the content vault (see content/) into compact module data: the
 * frontmatter of each note, keyed by its filename (a slug; see "Naming" in TODO.md). Bodies are left out, as they
 * belong in windows rather than in the bundle.
 */

import { readdir, readFile } from "fs/promises";
import { basename, join } from "path";
import { parse } from "yaml";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

// frontmatter values that say nothing, & are left out of module data (eg. "rating:" not yet filled in)
const isEmpty = value => value === null || value === "" || value === false
    || (Array.isArray(value) && value.length === 0);

// fields holding dates as precise as known (eg. "2024-06-28", "2024-05", or "2023"), which are text, even where
// YAML reads them as numbers (an unquoted year)
const DATES = new Set([ "date", "started", "finished" ]);

/**
 * Read frontmatter of every note in folder of content vault.
 *
 * @param dir path of folder
 * @returns {Promise<{ entries: object[], files: string[] }>} frontmatter of each note (with its slug, & without
 *          empty fields), in order of slug, leaving out drafts, & paths of notes read (to watch for changes)
 */
export const bakeContent = async dir => {
    const files = (await readdir(dir)).filter(name => name.endsWith(".md")).sort().map(name => join(dir, name));
    const entries = await Promise.all(files.map(async path => {
        const frontmatter = FRONTMATTER.exec(await readFile(path, "utf8"))?.[ 1 ];
        if (frontmatter === undefined) throw new Error(`Content: ${path} has no frontmatter`);
        const fields = parse(frontmatter) ?? {};
        return {
            slug: basename(path, ".md"),
            ...Object.fromEntries(Object.entries(fields)
                .filter(([ , value ]) => !isEmpty(value))
                .map(([ key, value ]) => [ key, DATES.has(key) ? String(value) : value ])),
        };
    }));
    return { entries: entries.filter(({ draft }) => draft !== true), files };
};
