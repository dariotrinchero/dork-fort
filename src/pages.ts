import type { MenuSection } from "shell";
import type { RGB } from "types/global";
import type { WindowContent } from "window";

import PAGES from "content/pages";

// pages with entries of their own in menus of their destinations (see menu & commands in content/schema.yaml), each
// opening a window showing its body
const ENTRIES = PAGES.filter(({ menu }) => menu !== undefined);

/**
 * Get section of menu of destination listing its pages (with entries of their own).
 *
 * @param destination name of destination, eg. "garden"
 * @param accent accent colour of destination
 * @returns section of menu (or undefined if destination has no such pages)
 */
export const pagesMenu = (destination: string, accent: RGB): MenuSection | undefined => {
    const pages = ENTRIES.filter(page => page.destination === destination);
    return pages.length === 0 ? undefined : {
        entries: pages.map(({ commands, menu = "", slug }) => ({
            aliases: commands,
            label: [{ color: accent, text: menu }],
            name: slug,
        })),
    };
};

/**
 * Get contents of window of page, opened from its destination.
 *
 * @param destination name of destination, eg. "garden"
 * @param name slug of page, eg. "baraka"
 * @returns contents of window (or undefined if destination has no such page)
 */
export const pageWindow = (destination: string, name: string): WindowContent | undefined => {
    const page = ENTRIES.find(({ destination: shown, slug }) => shown === destination && slug === name);
    return page && { body: page.body, title: `${destination}/${name}` };
};
