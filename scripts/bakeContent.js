/**
 * Compile-time reader turning a folder of the content vault (see content/) into compact module data: the
 * frontmatter of each note, keyed by its filename (a slug; see "Content" in README.md). Bodies are left out, as they
 * belong in windows rather than in the bundle.
 */

import { readdir, readFile } from "fs/promises";
import { basename, dirname, join } from "path";
import { isEmpty as isUnset, loadSchema, readFrontmatter } from "./validateContent.js";

// frontmatter values that say nothing, & are left out of module data (eg. "rating:" not yet filled in)
const isEmpty = value => isUnset(value) || value === false;

// types of fields holding dates (eg. "2024-06-28", "2024-05", or "2023"), which are text, even where YAML reads
// them as numbers (an unquoted year, which validation rejects)
const DATES = new Set([ "date", "partial-date" ]);

/**
 * Read frontmatter of every note in folder of content vault.
 *
 * @param dir path of folder
 * @returns {Promise<{ entries: object[], files: string[] }>} frontmatter of each note (with its slug, & without
 *          empty fields), in order of slug, leaving out drafts, & paths of notes read & of the schema (to watch for
 *          changes)
 */
export const bakeContent = async dir => {
    const schema = await loadSchema(dirname(dir));
    const fields = schema.collections[ basename(dir) ]?.fields ?? {};
    const files = (await readdir(dir)).filter(name => name.endsWith(".md")).sort().map(name => join(dir, name));
    const entries = await Promise.all(files.map(async path => {
        const frontmatter = readFrontmatter(await readFile(path, "utf8"));
        if (frontmatter === undefined) throw new Error(`Content: ${path} has no frontmatter`);
        return {
            slug: basename(path, ".md"),
            ...Object.fromEntries(Object.entries(frontmatter)
                .filter(([ , value ]) => !isEmpty(value))
                .map(([ key, value ]) => [ key, DATES.has(fields[ key ]?.type) ? String(value) : value ])),
        };
    }));
    return {
        entries: entries.filter(({ draft }) => draft !== true),
        files: [ ...files, join(dirname(dir), "schema.yaml") ],
    };
};
