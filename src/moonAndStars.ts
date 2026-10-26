import type { Film, Novel, ReadingStatus } from "types/content";
import type { Line, RGB, Segment } from "types/global";
import type { MenuSection } from "shell";
import type { WindowContent } from "window";

import { DIM, FG } from "palette";
import { escapeHtml } from "window";

import FILMS from "content/films";
import NOVELS from "content/novels";
import PAGES from "content/pages";

// ranked lists are pages shown by moon & stars
const LISTS = PAGES.filter(({ destination }) => destination === "moon-and-stars");

/**
 * Describe where a medium stands: what is in progress (the first, & how many others), or else what was finished
 * most recently, eg. "reading gideon the ninth", or "watched after hours".
 *
 * @param entries entries of medium (eg. novels)
 * @param doing status of entries in progress, which also describes them (eg. "reading")
 * @param done status of entries finished, which also describes them (eg. "read")
 * @returns segments of description (empty if nothing is in progress or dated as finished)
 */
const standing = (entries: (Film | Novel)[], doing: string, done: string): Segment[] => {
    const [first, ...others] = entries.filter(({ status }) => status === doing);
    // dates as precise as known sort as text, those known only to the year or month before others in it
    const [last] = entries.filter(({ finished, status }) => status === done && finished !== undefined)
        .sort((a, b) => (b.finished ?? "").localeCompare(a.finished ?? ""));
    const [status, entry] = first ? [doing, first] : [done, last];
    if (!entry) return [];
    return [
        { color: DIM, text: `${status} ` },
        { color: FG, text: entry.title.toLowerCase() },
        ...others.length > 0 ? [{ color: DIM, text: ` +${others.length.toString()}` }] : [],
    ];
};

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
 * Get menu of moon & stars: one row per medium, each followed by where it stands (see standing()), or for lists,
 * their names.
 *
 * @param accent accent colour of moon & stars
 * @returns sections of menu
 */
export const moonAndStarsMenu = (accent: RGB): MenuSection[] => {
    const rows: [string, Segment[]][] = [
        ["books", standing(NOVELS, "reading", "read")],
        ["films", standing(FILMS, "watching", "watched")],
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

// words belonging to a surname when they come before it (as in Le Guin, or de Beauvoir); as in dork's surname()
// (tools/dork/dork/slugs.py), so that both order authors alike
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
 * Order novels by author's surname (those without an author last), then by author, then by title, as dork lists
 * them.
 *
 * @param a novel
 * @param b novel
 * @returns negative if a comes first, positive if b does, & otherwise 0
 */
const byName = (a: Novel, b: Novel): number =>
    Number(!a.author) - Number(!b.author)
    || surname(a.author ?? "").localeCompare(surname(b.author ?? ""))
    || (a.author ?? "").localeCompare(b.author ?? "")
    || a.title.localeCompare(b.title);

/**
 * Order novels by date finished, latest first (dates as precise as known sort as text, those known only to the year
 * or month before others in it), then undated ones by name (see byName).
 *
 * @param a novel
 * @param b novel
 * @returns negative if a comes first, positive if b does, & otherwise 0
 */
const byFinished = (a: Novel, b: Novel): number =>
    (b.finished ?? "").localeCompare(a.finished ?? "") || byName(a, b);

/**
 * Order novels shortlisted first, then by name (see byName).
 *
 * @param a novel
 * @param b novel
 * @returns negative if a comes first, positive if b does, & otherwise 0
 */
const byShortlist = (a: Novel, b: Novel): number =>
    Number(b.shortlist ?? false) - Number(a.shortlist ?? false) || byName(a, b);

// tabs of reading list, each of novels with a status, in an order (the first tab being shown at first)
const READING_TABS: { label: string; order: (a: Novel, b: Novel) => number; status: ReadingStatus }[] = [
    { label: "finished", order: byFinished, status: "read" },
    { label: "to read", order: byShortlist, status: "to-read" },
    { label: "paused", order: byName, status: "paused" },
    { label: "dnf", order: byName, status: "dnf" },
];

/**
 * Draw rating as five stars, filled in quarters, eg. "★★★★¾" for 4.75.
 *
 * @param rating rating, in [0, 5]
 * @returns stars
 */
const stars = (rating: number): string => {
    const whole = Math.floor(rating);
    const quarters = Math.round(4 * (rating - whole));
    const empty = 5 - whole - (quarters > 0 ? 1 : 0);
    return "★".repeat(whole) + (["", "¼", "½", "¾"][quarters] ?? "") + "☆".repeat(empty);
};

/**
 * Get HTML of entry of reading list: title (linking to window of novel), & at right its author, & for novels
 * finished, the month finished & rating.
 *
 * @param novel novel
 * @returns HTML of entry
 */
const readingEntry = ({ author = "", finished, rating, slug, status, title }: Novel): string => {
    const details = status === "read"
        ? [finished?.slice(0, 7), rating === undefined ? undefined : stars(rating)].filter(Boolean)
        : [];
    return `<li data-title="${escapeHtml(title)}" data-byline="${escapeHtml(author)}">`
        + `<a href="#moon-and-stars/${slug}">${escapeHtml(title)}</a>`
        + `<span class="dim"><span class="byline">${escapeHtml(author)}</span>${
            details.map(detail => ` · ${detail ?? ""}`).join("")}</span></li>`;
};

/**
 * Get HTML of body of reading list window: novels being read (pinned, unfiltered), then a filter box over tabs of
 * the rest (see READING_TABS), each under its own heading where tabs aren't shown (eg. without scripts).
 *
 * @returns HTML of body
 */
const readingListBody = (): string => {
    const reading = NOVELS.filter(({ status }) => status === "reading");
    const tabs = READING_TABS.map(tab => ({
        ...tab,
        id: tab.status,
        novels: NOVELS.filter(({ status }) => status === tab.status).sort(tab.order),
    }));
    return `
        <h2>Reading list</h2>
        ${reading.length === 0 ? "" : `
            <h3><span class="dim">## </span>Reading</h3>
            <ul class="index pinned">${reading.map(readingEntry).join("")}</ul>`}
        <label class="filter"><span class="dim">grep</span><input type="search" placeholder=""
            aria-label="Find books" autocomplete="off" spellcheck="false" /></label>
        <div class="tabs" role="tablist" hidden>${tabs.map(({ id, label, novels }, i) => `
            <button role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${(i === 0).toString()}"
                >${label} <span class="count">${novels.length.toString()}</span></button>`).join("")}
        </div>
        ${tabs.map(({ id, label, novels }) => `
            <section class="tab-panel" role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}">
                <h3><span class="dim">## </span>${label}</h3>
                ${novels.length === 0 ? `<p class="dim">none</p>` : `
                    <ul class="index">${novels.map(readingEntry).join("")}</ul>
                    <p class="dim no-matches">no matches</p>`}
            </section>`).join("")}`;
};

/**
 * Get contents of window opened from moon & stars.
 *
 * @param name name of item (menu entry)
 * @returns contents of window (or undefined if there is no such item)
 */
export const moonAndStarsWindow = (name: string): WindowContent | undefined =>
    name === "books" ? { body: readingListBody(), title: "moon-and-stars/books" } : undefined;
