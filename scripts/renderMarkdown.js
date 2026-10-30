/**
 * Compile-time renderer turning bodies of notes in the content vault (see content/) into HTML for windows, in their
 * typography: headings one level down (a note's "# " being the window's title, & its "## " sections, prefixed by a dim
 * "## "), links leaving the site opening in new tabs, & tables without headers given none (as in "| | |" heading a
 * table of fields, which Obsidian needs). Obsidian's own syntax is understood too: wikilinks (eg.
 * "[[the-cave-saramago|The Cave]]") link to windows of the notes named (where those are on the site), & embeds (eg.
 * "![[baraka.jpg]]") show images, from attachments/.
 */

import { existsSync, readdirSync } from "fs";
import { join, posix } from "path";
import { Marked } from "marked";

const ATTACHMENTS = "attachments";

/**
 * Find path of attachment named in note, as Obsidian does: from the vault root if named by its path, & otherwise by
 * its filename alone, anywhere in attachments/.
 *
 * @param contentDir path of vault
 * @param name name of attachment, eg. "baraka.jpg", or "attachments/photos/baraka.jpg"
 * @returns path from vault root (or undefined if there is no such attachment)
 */
const findAttachment = (contentDir, name) => {
    if (name.includes("/")) return existsSync(join(contentDir, name)) ? name : undefined;
    const search = dir => {
        for (const entry of readdirSync(join(contentDir, dir), { withFileTypes: true })) {
            const path = posix.join(dir, entry.name);
            const found = entry.isDirectory() ? search(path) : entry.name === name ? path : undefined;
            if (found) return found;
        }
        return undefined;
    };
    return existsSync(join(contentDir, ATTACHMENTS)) ? search(ATTACHMENTS) : undefined;
};

const escapeHtml = text =>
    text.replace(/[&<>"]/g, ch => ({ "\"": "&quot;", "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]);

/**
 * Make renderer of bodies of notes.
 *
 * @param contentDir path of vault
 * @param routes route of window of each note on site (eg. "moon-and-stars/the-cave-saramago"), keyed by slug
 * @returns function rendering body of note (given its path, for errors) to HTML, & attachments it embeds (paths from
 *          vault root, to be deployed alongside site at the same paths)
 */
export const markdownRenderer = (contentDir, routes) => {
    let attachments, note; // of note being rendered

    const wikilink = {
        name: "wikilink",
        level: "inline",
        start: src => src.match(/!?\[\[/)?.index,
        tokenizer(src) {
            const match = /^(!?)\[\[([^\]|#]*)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/.exec(src);
            if (match) return {
                type: "wikilink", raw: match[0], embed: match[1] === "!", target: match[2].trim(),
                heading: match[3], text: match[4],
            };
        },
        renderer({ embed, heading = "", target, text }) {
            if (embed) {
                const path = findAttachment(contentDir, target);
                if (!path) throw new Error(`Content: ${note} embeds ${target}, which isn't in ${ATTACHMENTS}/`);
                attachments.add(path);
                return `<img src="${escapeHtml(path)}" alt="${escapeHtml(text ?? "")}" />`;
            }
            const label = escapeHtml(text ?? (target || heading.slice(1)));
            const route = routes.get(target);
            return route ? `<a href="#${escapeHtml(route)}">${label}</a>` : label; // links within notes go nowhere, yet
        },
    };

    const marked = new Marked({
        extensions: [ wikilink ],
        renderer: {
            heading({ depth, tokens }) {
                const level = Math.min(depth + 1, 6);
                const prefix = depth === 2 ? `<span class="dim">## </span>` : "";
                return `<h${level}>${prefix}${this.parser.parseInline(tokens)}</h${level}>\n`;
            },
            link({ href, title, tokens }) {
                const external = /^https?:\/\//.test(href);
                return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ""}${
                    external ? ` target="_blank" rel="noopener"` : ""}>${this.parser.parseInline(tokens)}</a>`;
            },
            image({ href, text }) {
                if (/^[a-z]+:/.test(href)) return false; // default rendering of images elsewhere
                const path = findAttachment(contentDir, decodeURI(href));
                if (!path) throw new Error(`Content: ${note} embeds ${href}, which isn't in ${ATTACHMENTS}/`);
                attachments.add(path);
                return `<img src="${escapeHtml(path)}" alt="${escapeHtml(text)}" />`;
            },
        },
    });

    return (path, markdown) => {
        attachments = new Set();
        note = path;
        const html = marked.parse(markdown)
            .replace(/<thead>\s*<tr>(?:\s*<th[^>]*><\/th>)+\s*<\/tr>\s*<\/thead>/g, ""); // headers left empty
        return { attachments: [ ...attachments ], html };
    };
};
