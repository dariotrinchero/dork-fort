import type { BoardGame, Film, Game, Novel } from "types/content";
import type { Line, RGB, Segment } from "types/global";
import type { MenuSection } from "shell";
import type { WindowContent } from "window";

import { DIM, FG } from "palette";
import { escapeHtml } from "window";

import BOARD_GAMES from "content/boardgames";
import FILMS from "content/films";
import GAMES from "content/games";
import NOVELS from "content/novels";
import PAGES from "content/pages";

// ranked lists are pages shown by moon & stars (besides any with menu entries of their own; see pages.ts)
const LISTS = PAGES.filter(({ destination, menu }) => destination === "moon-and-stars" && menu === undefined);

// entry of any medium, & order of entries (negative if a comes first, positive if b does, & otherwise 0)
type Entry = Novel | Film | Game | BoardGame;
type Order<T> = (a: T, b: T) => number;

// field of entry, shown in its window: its name, & its value as HTML (or undefined if unknown, & not shown)
type Field = [string, string | undefined];

// medium shown by moon & stars (eg. books): a menu entry opening a window exploring its entries (in tabs by status,
// below those in progress), each of which opens a window of its own
interface Medium<T extends Entry> {
    name: string;    // menu entry & name of its window, eg. "books"
    title: string;   // title of window exploring entries, eg. "Reading list"
    entries: T[];
    doing?: string;  // status of entries in progress, which also describes them (eg. "reading"), if any
    done: string;    // status of entries finished, which also describes them (eg. "read")
    tabs: { label: string; order: Order<T>; status: string }[]; // the first tab being shown at first
    date: (entry: T) => string | undefined;   // when entry was finished (or eg. first played)
    byline: (entry: T) => string | undefined; // eg. author
    fields: (entry: T) => Field[];             // fields particular to medium (see trackedFields() for the rest)
}

// medium, as moon & stars shows it
interface Shelf {
    name: string;
    standing: Segment[]; // where medium stands (see standing())
    window: (name: string) => WindowContent | undefined; // window exploring entries, or of an entry, by name
}

// words belonging to a surname when they come before it (as in Le Guin, or de Beauvoir); as in handle's surname()
// (tools/handle/handle/slugs.py), so that both order authors alike
const PARTICLES = new Set([ "le", "la", "de", "du", "des", "del", "della", "di", "da", "van", "von", "der", "den",
    "ter", "ten", "st", "st." ]);

/**
 * Get surname of person, with any particles before it.
 *
 * @param name name of person, eg. "Ursula K. Le Guin"
 * @returns surname, eg. "Le Guin"
 */
const surname = (name: string): string => {
    const words = name.split(/\s+/).filter(Boolean);
    let i = words.length - 1;
    while (i > 1 && PARTICLES.has(words[i - 1]?.toLowerCase() ?? "")) i--;
    return words.slice(i).join(" ");
};

/**
 * Order novels by author's surname (those without an author last), then by author, then by series (or a book outside
 * one, by its title) & number in it, then by title, as handle lists them.
 *
 * @param a novel
 * @param b novel
 * @param latestFirst whether a series goes highest number first (as a newest-first timeline has one read in order)
 * @returns negative if a comes first, positive if b does, & otherwise 0
 */
const byName = (a: Novel, b: Novel, latestFirst = false): number =>
    Number(!a.author) - Number(!b.author)
    || surname(a.author ?? "").localeCompare(surname(b.author ?? ""))
    || (a.author ?? "").localeCompare(b.author ?? "")
    || (a.series ?? a.title).localeCompare(b.series ?? b.title)
    || (latestFirst ? -1 : 1) * ((a["series-number"] ?? -1) - (b["series-number"] ?? -1))
    || a.title.localeCompare(b.title);

// order entries by title
const byTitle: Order<Entry> = (a, b) => a.title.localeCompare(b.title);

/**
 * Order entries by date, latest first (dates as precise as known sort as text, those known only to the year or month
 * before others in it), then those of the same date (or undated) by given order.
 *
 * @param date date of entry
 * @param then order of entries of the same date
 * @returns order of entries
 */
const latest = <T extends Entry>(date: (entry: T) => string | undefined, then: Order<T>): Order<T> =>
    (a, b) => (date(b) ?? "").localeCompare(date(a) ?? "") || then(a, b);

/**
 * Order entries shortlisted first, then by given order.
 *
 * @param then order of entries alike shortlisted (or not)
 * @returns order of entries
 */
const shortlisted = <T extends Entry>(then: Order<T>): Order<T> =>
    (a, b) => Number(b.shortlist ?? false) - Number(a.shortlist ?? false) || then(a, b);

/**
 * Draw rating as five stars, filled in quarters (eg. "★★★★¾" for 4.75), the filled ones in their own colour, &
 * the empty ones dim.
 *
 * @param rating rating, in [0, 5]
 * @returns HTML of stars
 */
const stars = (rating: number): string => {
    const whole = Math.floor(rating);
    const quarters = Math.round(4 * (rating - whole));
    const empty = 5 - whole - (quarters > 0 ? 1 : 0);
    return `<span class="stars">${"★".repeat(whole)}${["", "¼", "½", "¾"][quarters] ?? ""}</span>`
        + `<span class="dim">${"☆".repeat(empty)}</span>`;
};

/**
 * Format value of field as HTML.
 *
 * @param value value (or undefined if unknown)
 * @returns HTML of value (or undefined if unknown)
 */
const text = (value?: string | number): string | undefined =>
    value === undefined ? undefined : escapeHtml(value.toString());

/**
 * Get fields shared by entries of every medium: status, rating, whether owned, who recommended it, & tags.
 *
 * @param entry entry
 * @returns fields
 */
const trackedFields = (entry: Entry): Field[] => {
    const owned = "owned" in entry ? entry.owned : undefined;
    return [
        ["status", text(entry.status.replace("-", " "))],
        ["rating", entry.rating === undefined ? undefined : stars(entry.rating)],
        ["owned", owned === true ? "yes" : owned === "wishlist" ? owned : undefined],
        ["recommended by", text(entry["recommended-by"])],
        ["tags", entry.tags?.length
            ? `<span class="accent">${text(entry.tags.map(tag => `#${tag}`).join(" ")) ?? ""}</span>`
            : undefined],
    ];
};

/**
 * Get fields of what's started & finished.
 *
 * @param entry entry
 * @returns fields
 */
const datedFields = ({ finished, started }: Novel | Film | Game): Field[] =>
    [["started", text(started)], ["finished", text(finished)]];

/**
 * Describe where a medium stands: what is in progress (the first, & how many others), or else what was finished
 * most recently, eg. "reading gideon the ninth", or "watched after hours".
 *
 * @param medium medium
 * @returns segments of description (empty if nothing is in progress or dated as finished)
 */
const standing = <T extends Entry>({ date, doing, done, entries }: Medium<T>): Segment[] => {
    const [first, ...others] = doing === undefined ? [] : entries.filter(({ status }) => status === doing);
    const [last] = entries.filter(entry => entry.status === done && date(entry) !== undefined)
        .sort(latest(date, () => 0));
    const [status, entry] = first ? [doing, first] : [done, last];
    if (!entry || status === undefined) return [];
    return [
        { color: DIM, text: `${status} ` },
        { color: FG, text: entry.title.toLowerCase() },
        ...others.length > 0 ? [{ color: DIM, text: ` +${others.length.toString()}` }] : [],
    ];
};

/**
 * Get HTML of entry of index of medium: title (linking to window of entry), & at right its byline, & for entries
 * finished, the month finished, & its rating, if any.
 *
 * @param medium medium
 * @param entry entry
 * @returns HTML of entry
 */
const indexEntry = <T extends Entry>({ byline, date, done }: Medium<T>, entry: T): string => {
    const finished = entry.status === done ? date(entry)?.slice(0, 7) : undefined;
    const details = [text(finished), entry.rating === undefined ? undefined : stars(entry.rating)].filter(Boolean);
    const by = byline(entry) ?? "";
    return `<li data-title="${escapeHtml(entry.title)}" data-byline="${escapeHtml(by)}">`
        + `<a href="#moon-and-stars/${entry.slug}">${escapeHtml(entry.title)}</a>`
        + `<span class="dim"><span class="byline">${escapeHtml(by)}</span>${
            details.map(detail => ` · ${detail ?? ""}`).join("")}</span></li>`;
};

/**
 * Get HTML of body of window exploring medium: entries in progress (pinned, unfiltered), then a filter box over tabs
 * of the rest, each under its own heading where tabs aren't shown (eg. without scripts).
 *
 * @param medium medium
 * @returns HTML of body
 */
const indexBody = <T extends Entry>(medium: Medium<T>): string => {
    const { doing, entries, name, tabs, title } = medium;
    const pinned = doing === undefined ? [] : entries.filter(({ status }) => status === doing);
    const heading = doing === undefined ? "" : `${doing.charAt(0).toUpperCase()}${doing.slice(1)}`; // eg. "Reading"
    const panels = tabs.map(tab => ({
        ...tab,
        entries: entries.filter(({ status }) => status === tab.status).sort(tab.order),
        id: tab.status,
    }));
    return `
        <h2>${escapeHtml(title)}</h2>
        ${pinned.length === 0 ? "" : `
            <h3><span class="dim">## </span>${escapeHtml(heading)}</h3>
            <ul class="index pinned">${pinned.map(entry => indexEntry(medium, entry)).join("")}</ul>`}
        <label class="filter"><span class="dim">grep</span><input type="search" placeholder=""
            aria-label="Find ${name}" autocomplete="off" spellcheck="false" /></label>
        <div class="tabs" role="tablist" hidden>${panels.map(({ entries: shown, id, label }, i) => `
            <button role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${(i === 0).toString()}"
                >${label} <span class="count">${shown.length.toString()}</span></button>`).join("")}
        </div>
        ${panels.map(({ entries: shown, id, label }) => `
            <section class="tab-panel" role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}">
                <h3><span class="dim">## </span>${label}</h3>
                ${shown.length === 0 ? `<p class="dim">none</p>` : `
                    <ul class="index">${shown.map(entry => indexEntry(medium, entry)).join("")}</ul>
                    <p class="dim no-matches">no matches</p>`}
            </section>`).join("")}`;
};

/**
 * Get HTML of body of window of entry: its title & byline, & its fields (those known).
 *
 * @param medium medium
 * @param entry entry
 * @returns HTML of body
 */
const entryBody = <T extends Entry>({ byline, fields }: Medium<T>, entry: T): string => {
    const by = byline(entry);
    const known = [...fields(entry), ...trackedFields(entry)].filter(([, value]) => value !== undefined);
    return `
        <h2>${escapeHtml(entry.title)}</h2>
        ${by === undefined ? "" : `<p class="dim">${escapeHtml(by)}</p>`}
        <dl class="fields">${known.map(([name, value]) => `<dt>${name}</dt><dd>${value ?? ""}</dd>`).join("")}</dl>`;
};

/**
 * Shelve medium, as moon & stars shows it.
 *
 * @param medium medium
 * @returns shelf
 */
const shelve = <T extends Entry>(medium: Medium<T>): Shelf => ({
    name: medium.name,
    standing: standing(medium),
    window: name => {
        if (name === medium.name) return { body: indexBody(medium), title: `moon-and-stars/${name}` };
        const entry = medium.entries.find(({ slug }) => slug === name);
        return entry && { body: entryBody(medium, entry), title: `moon-and-stars/${name}` };
    },
});

// media, in order of menu
const SHELVES: Shelf[] = [
    shelve<Novel>({
        byline: ({ author }) => author,
        date: ({ finished }) => finished,
        doing: "reading",
        done: "read",
        entries: NOVELS,
        fields: entry => [
            ["translator", text(entry.translator)],
            ["series", text(entry.series && `${entry.series}${
                entry["series-number"] === undefined ? "" : ` #${entry["series-number"].toString()}`}`)],
            ["year", text(entry.year)],
            ["pages", text(entry.pages)],
            ["isbn", text(entry.isbn)],
            ...datedFields(entry),
        ],
        name: "books",
        tabs: [
            {
                label: "finished",
                order: latest(({ finished }) => finished, (a, b) => byName(a, b, true)),
                status: "read",
            },
            { label: "to read", order: shortlisted(byName), status: "to-read" },
            { label: "paused", order: shortlisted(byName), status: "paused" },
            { label: "dnf", order: byName, status: "dnf" },
        ],
        title: "Reading list",
    }),
    shelve<Film>({
        byline: ({ director }) => director,
        date: ({ finished }) => finished,
        doing: "watching",
        done: "watched",
        entries: FILMS,
        fields: entry => [["kind", text(entry.kind)], ["year", text(entry.year)], ...datedFields(entry)],
        name: "films",
        tabs: [
            { label: "watched", order: latest<Film>(({ finished }) => finished, byTitle), status: "watched" },
            { label: "to watch", order: shortlisted(byTitle), status: "to-watch" },
            { label: "paused", order: shortlisted(byTitle), status: "paused" },
            { label: "dnf", order: byTitle, status: "dnf" },
        ],
        title: "Watch list",
    }),
    shelve<Game>({
        byline: ({ developer }) => developer,
        date: ({ finished }) => finished,
        doing: "playing",
        done: "played",
        entries: GAMES,
        fields: entry => [["year", text(entry.year)], ["platform", text(entry.platform)], ...datedFields(entry)],
        name: "games",
        tabs: [
            { label: "played", order: latest<Game>(({ finished }) => finished, byTitle), status: "played" },
            { label: "endless", order: byTitle, status: "endless" },
            { label: "to play", order: shortlisted(byTitle), status: "to-play" },
            { label: "paused", order: shortlisted(byTitle), status: "paused" },
            { label: "dnf", order: byTitle, status: "dnf" },
        ],
        title: "Games",
    }),
    shelve<BoardGame>({
        byline: ({ designer }) => designer,
        date: entry => entry["first-played"],
        done: "played",
        entries: BOARD_GAMES,
        fields: entry => [
            ["year", text(entry.year)],
            ["players", text(entry.players)],
            ["first played", text(entry["first-played"])],
        ],
        name: "boardgames",
        tabs: [
            { label: "played", order: latest<BoardGame>(entry => entry["first-played"], byTitle), status: "played" },
            { label: "to play", order: shortlisted(byTitle), status: "to-play" },
        ],
        title: "Board games",
    }),
];

/**
 * Get lines describing moon & stars, shown above its menu.
 *
 * @returns lines of description
 */
export const moonAndStarsIntro = (): Line[] => [
    [{ color: DIM, text: "sort: the night sky, in order of brightness" }],
    [],
];

/**
 * Get menu of moon & stars: one row per medium, each followed by where it stands (see standing()), & then lists,
 * followed by their names.
 *
 * @param accent accent colour of moon & stars
 * @returns sections of menu
 */
export const moonAndStarsMenu = (accent: RGB): MenuSection[] => {
    const rows: [string, Segment[]][] = [
        ...SHELVES.map(({ name, standing: detail }): [string, Segment[]] => [name, detail]),
        ["lists", LISTS.length === 0
            ? []
            : [{ color: FG, text: LISTS.map(({ title }) => title.toLowerCase()).join(", ") }]],
    ];
    return [{
        entries: rows.map(([name, detail]) => ({
            label: [{ color: accent, text: detail.length > 0 ? `${name}  ` : name }, ...detail],
            name,
        })),
    }];
};

/**
 * Get contents of window opened from moon & stars.
 *
 * @param name name of item (menu entry, or entry of a medium)
 * @returns contents of window (or undefined if there is no such item)
 */
export const moonAndStarsWindow = (name: string): WindowContent | undefined =>
    SHELVES.reduce<WindowContent | undefined>((found, shelf) => found ?? shelf.window(name), undefined);
