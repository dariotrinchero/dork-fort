/**
 * Compile-time reader turning a folder of the content vault (see content/) into compact module data: the
 * frontmatter of each note, keyed by its filename (a slug; see "Content" in README.md). Bodies are left out, as they
 * belong in windows rather than in the bundle, except those of pages (few, & each a window of its own), which are
 * rendered to HTML (see renderMarkdown.js).
 */

import { existsSync } from "fs";
import { readdir, readFile } from "fs/promises";
import { basename, dirname, join } from "path";
import { markdownRenderer } from "./renderMarkdown.js";
import { FRONTMATTER, isEmpty as isUnset, loadSchema, readFrontmatter } from "./validateContent.js";

// frontmatter values that say nothing, & are left out of module data (eg. "rating:" not yet filled in)
const isEmpty = value => isUnset(value) || value === false;

// types of fields holding dates (eg. "2024-06-28", "2024-05", or "2023"), which are text, even where YAML reads
// them as numbers (an unquoted year, which validation rejects)
const DATES = new Set([ "date", "partial-date" ]);

// collections whose bodies are baked too, as "body" (HTML)
const WITH_BODIES = new Set([ "pages" ]);

/**
 * Find route of window of every note in vault (eg. "moon-and-stars/the-cave-saramago"), for links between them.
 *
 * @param contentDir path of vault
 * @param schema schema of vault
 * @returns route of each note, keyed by slug (leaving out drafts)
 */
const routesOf = async (contentDir, schema) => {
    const routes = new Map();
    for (const [ name, collection ] of Object.entries(schema.collections)) {
        const dir = join(contentDir, name);
        if (!existsSync(dir)) continue;
        for (const file of (await readdir(dir)).filter(f => f.endsWith(".md"))) {
            const frontmatter = readFrontmatter(await readFile(join(dir, file), "utf8")) ?? {};
            const [ slug, destination ] = [ basename(file, ".md"), collection.destination ?? frontmatter.destination ];
            if (frontmatter.draft !== true && destination) routes.set(slug, `${destination}/${slug}`);
        }
    }
    return routes;
};

/**
 * Read frontmatter of every note in folder of content vault.
 *
 * @param dir path of folder
 * @returns {Promise<{ entries: object[], files: string[], attachments: string[] }>} frontmatter of each note (with
 *          its slug, its body if baked, & without empty fields), in order of slug, leaving out drafts; paths of notes
 *          read & of the schema (to watch for changes); & attachments embedded in bodies baked (paths from vault root,
 *          to be deployed at the same paths)
 */
export const bakeContent = async dir => {
    const contentDir = dirname(dir);
    const schema = await loadSchema(contentDir);
    const fields = schema.collections[ basename(dir) ]?.fields ?? {};
    const render = WITH_BODIES.has(basename(dir)) ? markdownRenderer(contentDir, await routesOf(contentDir, schema))
        : undefined;
    const attachments = new Set();
    const files = (await readdir(dir)).filter(name => name.endsWith(".md")).sort().map(name => join(dir, name));
    const entries = await Promise.all(files.map(async path => {
        const text = await readFile(path, "utf8");
        const frontmatter = readFrontmatter(text);
        if (frontmatter === undefined) throw new Error(`Content: ${path} has no frontmatter`);
        const entry = {
            slug: basename(path, ".md"),
            ...Object.fromEntries(Object.entries(frontmatter)
                .filter(([ , value ]) => !isEmpty(value))
                .map(([ key, value ]) => [ key, DATES.has(fields[ key ]?.type) ? String(value) : value ])),
        };
        if (!render || entry.draft === true) return entry;
        const { attachments: embedded, html } = render(path, text.replace(FRONTMATTER, ""));
        embedded.forEach(attachment => attachments.add(attachment));
        return { ...entry, body: html };
    }));
    return {
        entries: entries.filter(({ draft }) => draft !== true),
        files: [ ...files, join(contentDir, "schema.yaml") ],
        attachments: [ ...attachments ].sort(),
    };
};
