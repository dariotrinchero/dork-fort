import type { Line, RGB } from "types/global";
import type { MenuSection } from "shell";
import type { WindowContent } from "window";

import { DIM, FG } from "palette";
import { escapeHtml } from "window";

// placeholder recipes (for proof of concept), the first few of which are favourites
const RECIPES = [
    "Lorem Ipsum Stew", "Dolor Sit Curry", "Slow-Roasted Consectetur Tart with Adipiscing Elit & Tempor Glaze",
    "Adipiscing Gnocchi", "Elit Sed Soup",
    "Eiusmod Flatbread", "Tempor Dumplings", "Incididunt Salad",
];
const FAVOURITES = 3;

/**
 * Convert title into name usable in URLs & as a command, eg. "Lorem Ipsum Stew" to "lorem-ipsum-stew".
 *
 * @param title title
 * @returns name
 */
const slug = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Get menu of campfire: favourite recipes (starred, beside icon where there is room), then cookbook & journal.
 *
 * @param accent accent colour of campfire
 * @returns sections of menu
 */
export const campfireMenu = (accent: RGB): MenuSection[] => [
    {
        aside: true,
        entries: RECIPES.slice(0, FAVOURITES).map(title => ({
            label: [{ color: FG, text: title.toLowerCase() }],
            marker: { color: accent, text: "★ " },
            name: slug(title),
        })),
        heading: [{ color: DIM, text: "favourites:" }],
    },
    {
        entries: ["cookbook", "journal"].map(name => ({ label: [{ color: accent, text: name }], name })),
    },
];

/**
 * Get lines describing campfire, shown above its menu.
 *
 * @returns lines of description
 */
export const campfireIntro = (): Line[] => [
    [{ color: DIM, text: "touch: mmmm, flambe!" }],
    [],
];

/**
 * Get placeholder body of recipe window, showing off typography of recipes.
 *
 * @param title title of recipe
 * @returns HTML of body
 */
const recipeBody = (title: string): string => `
    <h2>${escapeHtml(title)}</h2>
    <p class="dim">1h · serves 4 · vegan · <span class="accent">#lorem #ipsum</span></p>
    <h3><span class="dim">## </span>Ingredients</h3>
    <ul class="checklist">
        ${["2 tins lorem ipsum", "1 handful dolor sit amet", "3 cloves consectetur", "1/2 tsp adipiscing elit",
            "Sed do eiusmod tempor, to taste"].map(item =>
            `<li><label><input type="checkbox" /><span>${item}</span></label></li>`).join("")}
    </ul>
    <h3><span class="dim">## </span>Method</h3>
    <ol>
        <li>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et
            dolore magna aliqua.</li>
        <li>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
            consequat, for 20 minutes.</li>
        <li>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
            Excepteur sint occaecat cupidatat non proident.</li>
        <li>Sunt in culpa qui officia deserunt mollit anim id est laborum.</li>
    </ol>
    <h3><span class="dim">## </span>Notes</h3>
    <ul>
        <li>Curabitur pretium tincidunt lacus; nulla gravida orci a odio.</li>
        <li>Adapted from <a href="https://example.com" target="_blank" rel="noopener">[lorem ipsum]</a>.</li>
    </ul>`;

// placeholder body of cookbook window: a filter box, & every recipe, linking to its window
const COOKBOOK_BODY = `
    <h2>Cookbook</h2>
    <label class="filter"><span class="dim">grep</span><input type="search" placeholder=""
        aria-label="Find recipes" autocomplete="off" spellcheck="false" /></label>
    <ul class="index">
        ${RECIPES.map((title, i) => `<li data-title="${escapeHtml(title)}"><a href="#campfire/${slug(title)}">${
            escapeHtml(title)}</a><span class="dim">${i % 2 ? "45min" : "1h"} · ${
            i % 3 ? "vegan" : "vegetarian"}</span></li>`)
            .join("")}
    </ul>
    <p class="dim no-matches">no matches</p>`;

// placeholder body of journal window: dated entries, linking to their recipes
const JOURNAL_BODY = `
    <h2>Journal</h2>
    ${RECIPES.slice(0, 4).map((title, i) => `
        <h3><span class="dim">${(10 - i).toString().padStart(2, "0")}-10-2026 · </span><a
            href="#campfire/${slug(title)}">${escapeHtml(title)}</a></h3>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit; sed do eiusmod tempor incididunt ut labore.</p>`)
        .join("")}`;

/**
 * Get contents of window opened from campfire.
 *
 * @param name name of item (menu entry, or recipe)
 * @returns contents of window (or undefined if there is no such item)
 */
export const campfireWindow = (name: string): WindowContent | undefined => {
    if (name === "cookbook") return { body: COOKBOOK_BODY, title: "campfire/cookbook" };
    if (name === "journal") return { body: JOURNAL_BODY, title: "campfire/journal" };
    const title = RECIPES.find(recipe => slug(recipe) === name);
    return title === undefined ? undefined : { body: recipeBody(title), title: `campfire/${name}` };
};
