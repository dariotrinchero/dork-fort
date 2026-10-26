/**
 * Validator for the content vault (see content/), checking every note against content/schema.yaml: its slug, its
 * fields' types & values, & whether its status agrees with its dates. Also checks the templates list the schema's
 * fields, attachments exist, & no two notes share a URL. dork (tools/dork/) implements the same rules in Python;
 * tests/validators.yaml holds cases both must agree on.
 *
 * Run directly (npm run check) to validate the vault, exiting with failure if anything is wrong: `node
 * scripts/validateContent.js [--json] [vault]`, where --json prints the problems as JSON instead (for dork's tests).
 */

import { existsSync } from "fs";
import { readdir, readFile } from "fs/promises";
import { basename, join, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { parse } from "yaml";

export const CONTENT = resolve(fileURLToPath(import.meta.url), "../../content");
export const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

// folders of vault holding no collection
const NOT_COLLECTIONS = new Set([ "Templates", "Bases", "attachments" ]);

/**
 * Read schema of vault, giving each collection the fields shared by those with a status, & a list of templates.
 *
 * @param contentDir path of vault
 * @returns schema, as in content/schema.yaml
 */
export const loadSchema = async (contentDir = CONTENT) => {
    const schema = parse(await readFile(join(contentDir, "schema.yaml"), "utf8"));
    for (const collection of Object.values(schema.collections)) {
        if (collection.status) collection.fields = { ...schema.tracked, ...collection.fields };
        collection.templates = [ collection.template ].flat();
    }
    return schema;
};

// field values that say nothing (eg. "rating:" not yet filled in)
export const isEmpty = value => value === null || value === undefined || value === ""
    || (Array.isArray(value) && value.length === 0);

const isInt = value => Number.isInteger(value);
const isNumber = value => typeof value === "number" && Number.isFinite(value);
const isString = value => typeof value === "string";

// whether string is a real date, as precise as known ("2024-06-28", "2024-05", or "2023")
const isPartialDate = text => {
    const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(text);
    if (!match) return false;
    const [ year, month, day ] = [ match[ 1 ], match[ 2 ] ?? "01", match[ 3 ] ?? "01" ].map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

// whether string is an ISBN-10 or ISBN-13 (digits only) with a valid checksum
const isIsbn = text => {
    if (/^\d{9}[\dX]$/.test(text)) {
        const digits = [ ...text ].map(c => c === "X" ? 10 : Number(c));
        return digits.reduce((sum, d, i) => sum + (10 - i) * d, 0) % 11 === 0;
    }
    if (/^97[89]\d{10}$/.test(text)) {
        const digits = [ ...text ].map(Number);
        return digits.reduce((sum, d, i) => sum + (i % 2 ? 3 : 1) * d, 0) % 10 === 0;
    }
    return false;
};

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// patterns of string types, & what to say of strings that don't match
const PATTERNS = {
    tag: [ /^(?=.*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/, "should be lowercase & hyphens" ],
    date: [ /^\d{4}-\d{2}-\d{2}$/, "should be a date, eg. 2024-06-28" ],
    time: [ /^\d+:[0-5]\d$/, 'should be a duration, eg. "3:45"' ],
    initials: [ /^[A-Z]{2,3}$/, "should be initials, eg. JS" ],
    doi: [ /^10\.\d{4,9}\/\S+$/, "should be a DOI, eg. 10.1000/xyz123" ],
    arxiv: [ /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/, "should be an arXiv id, eg. 2107.03374" ],
    url: [ /^https?:\/\/\S+$/, "should be a URL" ],
    tmdb: [ /^(?:movie|tv)\/\d+$/, "should be movie/<id> or tv/<id>" ],
    // "--1" (etc.) tells apart games of a name
    igdb: [ /^[a-z0-9]+(?:-[a-z0-9]+)*(?:--\d+)?$/, "should be a slug on IGDB" ],
};

/**
 * Check value of field (or item of list field) against its type.
 *
 * @param field field, as in schema (eg. { type: "isbn" })
 * @param value value, non-empty
 * @param statuses status words of collection
 * @returns what is wrong, or undefined if nothing is
 */
export const checkValue = (field, value, statuses = []) => {
    const { type } = field;
    const quote = isString(value) ? "" : " (quote it, so YAML reads it as text)";
    switch (type) {
        case "text": return isString(value) ? undefined : `should be text${quote}`;
        case "list":
            if (!Array.isArray(value)) return "should be a list, eg. [a, b]";
            for (const item of value) {
                const problem = isEmpty(item) ? "is empty"
                    : checkValue({ ...field, type: field.item ?? "text" }, item, statuses);
                if (problem) return `item ${JSON.stringify(item)} ${problem}`;
            }
            return undefined;
        case "bool": return typeof value === "boolean" ? undefined : "should be true or false";
        case "year":
            return !isInt(value) ? "should be a year, eg. 1985"
                : value === 0 ? "should not be 0 (there is no year 0)"
                    : Math.abs(value) > 9999 ? "should be a year, eg. 1985" : undefined;
        case "count": return isInt(value) && value >= 0 ? undefined : "should be a whole number";
        case "series-number":
            return isNumber(value) && value >= 0 && Math.abs(value * 10 - Math.round(value * 10)) < 1e-9 ? undefined
                : "should be a number ≥ 0, eg. 3, 0 (a prequel), or 2.5 (between books)";
        case "number": return isNumber(value) && value >= 0 ? undefined : "should be a number";
        case "partial-date":
            return isString(value) && isPartialDate(value) ? undefined
                : `should be a date, eg. 2024-06-28, "2024-05", or "2023"${quote}`;
        case "rating":
            return isNumber(value) && value >= 1 && value <= 5 && isInt(value * 4) ? undefined
                : "should be 1–5, in quarter steps";
        case "isbn":
            return !isString(value) ? `should be an ISBN${quote}`
                : !/^\d{9}[\dX]$|^\d{13}$/.test(value) ? "should be an ISBN-10 or ISBN-13, digits only"
                    : isIsbn(value) ? undefined : "has a bad checksum";
        case "digits":
            return (isInt(value) && value >= 0) || (isString(value) && /^\d+$/.test(value)) ? undefined
                : "should be a numeric id";
        case "attachment":
            return isString(value) && new RegExp(`^attachments/${field.dir}/[^/]+$`).test(value) ? undefined
                : `should be a path in attachments/${field.dir}/`;
        case "enum":
            return field.values.includes(value) ? undefined : `should be one of: ${field.values.join(", ")}`;
        case "status": return statuses.includes(value) ? undefined : `should be one of: ${statuses.join(", ")}`;
        default: {
            const [ pattern, message ] = PATTERNS[type] ?? [];
            if (!pattern) return `has unknown type "${type}" in schema`;
            if (!isString(value)) return `${message}${quote}`;
            return pattern.test(value) && (type !== "date" || isPartialDate(value)) ? undefined : message;
        }
    }
};

// patterns of slug styles
const SLUGS = {
    kebab: [ KEBAB, "should be lowercase words & hyphens" ],
    citekey: [ /^[A-Za-z][A-Za-z0-9_-]*$/, "should be a citation key" ],
    dated: [ /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/, "should be <date>-<lowercase words & hyphens>" ],
};

/**
 * Check note against schema of its collection.
 *
 * @param schema schema, from loadSchema
 * @param name name of collection (its folder), eg. "novels"
 * @param slug filename of note, without extension
 * @param fields frontmatter of note
 * @returns problems, each naming field (or "slug"), & what is wrong with it
 */
export const checkEntry = (schema, name, slug, fields) => {
    const collection = schema.collections[name];
    const problems = [];
    const problem = (field, message) => problems.push({ field, message });

    const [ pattern, message ] = SLUGS[collection.slug.style];
    if (!pattern.test(slug)) problem("slug", `"${slug}" ${message}`);
    else if (collection.slug.style === "dated" && isString(fields.date) && !slug.startsWith(`${fields.date}-`))
        problem("slug", `"${slug}" should start with its date, ${fields.date}`);

    const statuses = Object.values(collection.status ?? {});
    for (const [ key, value ] of Object.entries(fields)) {
        const field = collection.fields[key];
        if (!field) problem(key, "is not a field of " + name);
        else if (!isEmpty(value)) {
            const wrong = checkValue(field, value, statuses);
            if (wrong) problem(key, wrong);
        }
    }
    for (const [ key, field ] of Object.entries(collection.fields)) {
        if (field.required && isEmpty(fields[key])) problem(key, "is required");
        if (field.requires && !isEmpty(fields[key]) && isEmpty(fields[field.requires]))
            problem(key, `needs ${field.requires} too`);
    }

    // status must agree with dates & flags: its role may forbid some (eg. nothing in the backlog is started), which
    // must then be empty (or a flag, false)
    const role = Object.keys(collection.status ?? {}).find(role => collection.status[role] === fields.status);
    for (const key of schema.roles[role]?.forbids ?? [])
        if (fields[key] !== false && !isEmpty(fields[key]))
            problem(key, `should be ${fields[key] === true ? "false" : "empty"} while ${fields.status}`);
    const { started, finished } = fields;
    if (isString(started) && isString(finished)) {
        const length = Math.min(started.length, finished.length);
        if (started.slice(0, length) > finished.slice(0, length)) problem("finished", "should not be before started");
    }
    return problems;
};

/**
 * Read frontmatter of note.
 *
 * @param text contents of note
 * @returns frontmatter, or undefined if note has none
 */
export const readFrontmatter = text => {
    const frontmatter = FRONTMATTER.exec(text)?.[ 1 ];
    return frontmatter === undefined ? undefined : parse(frontmatter) ?? {};
};

// top-level keys of template, in order (read as lines, since templates hold placeholders like {{date}})
const templateKeys = text => [ ...(FRONTMATTER.exec(text)?.[ 1 ] ?? "").matchAll(/^([\w-]+):/gm) ].map(m => m[ 1 ]);

/**
 * Validate every note in vault, & its templates.
 *
 * @param contentDir path of vault
 * @returns problems, each naming file (from vault), field (or "slug", or undefined), & what is wrong
 */
export const validateVault = async (contentDir = CONTENT) => {
    const schema = await loadSchema(contentDir);
    const problems = [];
    const urls = new Map(); // "<destination>/<slug>" → file

    for (const [ name, collection ] of Object.entries(schema.collections)) {
        const fields = Object.keys(collection.fields);
        for (const template of collection.templates) {
            const file = join("Templates", template);
            const path = join(contentDir, file);
            const keys = existsSync(path) ? templateKeys(await readFile(path, "utf8")) : [];
            const missing = fields.filter(key => !keys.includes(key));
            const extra = keys.filter(key => !fields.includes(key));
            if (missing.length || extra.length) problems.push({ file, message: [
                missing.length && `lacks ${missing.join(", ")}`,
                extra.length && `has unknown ${extra.join(", ")}`,
            ].filter(Boolean).join(" & ") + ` (fields of ${name} in schema.yaml)` });
        }

        const dir = join(contentDir, name);
        if (!existsSync(dir)) continue;
        // for each set of keys unique together: their values (as JSON) → file
        const seen = (collection.unique ?? []).map(() => new Map());
        for (const filename of (await readdir(dir)).filter(f => f.endsWith(".md")).sort()) {
            const file = join(name, filename);
            const slug = basename(filename, ".md");
            const frontmatter = readFrontmatter(await readFile(join(contentDir, file), "utf8"));
            if (frontmatter === undefined) {
                problems.push({ file, message: "has no frontmatter" });
                continue;
            }
            for (const { field, message } of checkEntry(schema, name, slug, frontmatter))
                problems.push({ file, field, message });

            // attachments must exist
            for (const [ key, field ] of Object.entries(collection.fields)) {
                if (field.type !== "attachment" && field.item !== "attachment") continue;
                for (const path of [ frontmatter[key] ].flat())
                    if (isString(path) && path.startsWith("attachments/") && !existsSync(join(contentDir, path)))
                        problems.push({ file, field: key, message: `names ${path}, which doesn't exist` });
            }

            // sets of keys unique together (eg. series & series-number) must be
            (collection.unique ?? []).forEach((keys, i) => {
                const values = keys.map(key => frontmatter[key]);
                if (values.some(isEmpty)) return;
                const together = JSON.stringify(values);
                if (seen[i].has(together)) problems.push({ file, field: keys.at(-1),
                    message: `shares ${values.join(" ")} with ${seen[i].get(together)}` });
                else seen[i].set(together, file);
            });

            // URLs (build/<destination>/<slug>.html) must be unique
            const url = `${collection.destination ?? frontmatter.destination}/${slug}`;
            if (urls.has(url))
                problems.push({ file, field: "slug", message: `clashes with ${urls.get(url)} (both at ${url})` });
            else urls.set(url, file);
        }
    }

    for (const entry of await readdir(contentDir, { withFileTypes: true }))
        if (entry.isDirectory() && !entry.name.startsWith(".") && !NOT_COLLECTIONS.has(entry.name)
            && !schema.collections[entry.name])
            problems.push({ file: entry.name, message: "is not a collection in schema.yaml" });
    return problems;
};

/**
 * Describe problem found in vault, eg. "content/novels/the-cave-saramago.md: isbn has a bad checksum".
 *
 * @param problem problem, from validateVault
 * @param contentDir path of vault
 * @returns description
 */
export const describe = ({ file, field, message }, contentDir = CONTENT) =>
    `${relative(process.cwd(), join(contentDir, file))}: ${field ? `${field} ` : ""}${message}`;

if (process.argv[ 1 ] === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const json = args.includes("--json");
    const contentDir = resolve(args.find(arg => !arg.startsWith("--")) ?? CONTENT);
    const problems = await validateVault(contentDir);
    if (json) console.log(JSON.stringify(problems));
    else problems.forEach(problem => console.error(describe(problem, contentDir)));
    if (!json) console.log(problems.length ? `✘ ${problems.length} problem${problems.length === 1 ? "" : "s"} in content`
        : "✔ Content is valid");
    process.exitCode = problems.length ? 1 : 0;
}
