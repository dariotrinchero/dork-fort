import type { RGB } from "types/global";

import { DIM, FG, INVERSE, STAR } from "palette";
import { fuzzyMatch } from "fuzzy";

// contents of window, whose behaviour follows from classes in its markup (eg. an index with a filter box; see
// setupIndex()), so that it can equally be a static page
export interface WindowContent {
    title: string; // title, shown in top border
    body: string;  // HTML of body
}

// requests made by window, which leave it to its opener to decide what happens (eg. through routing)
interface WindowRequests {
    close: () => void;              // on escape, close box, or clicking outside window
    link: (hash: string) => void;   // on following link to hash within site (without leading '#')
}

// size of each pixel of window font (drawn on an 11px grid, & 7px wide), in CSS pixels, chosen to fit MIN_COLUMNS
// across screen where that stays legible; windows use a finer text mode than the canvas, for longer text
const MAX_FONT_PIXEL = 2;
const MIN_FONT_PIXEL = 1.25;
const MIN_COLUMNS = 52; // leaving window body about 44 columns
const NEAR_LINES = 2; // lines out of view within which arrow keys move focus to next item (rather than scroll)

// items of window: those tab cycles through (incl. body, so that it can be scrolled), those arrow keys step through
// (in body), & those highlighted on hovering
const FOCUSABLE = "a[href], button, input, [tabindex]";
const ITEMS = "a[href], input";
const HOVERABLE = "a[href], button, .checklist label, .index li, [role=tab]";

// open window, key identifying its contents, & listener handling keys while it is open
let current: { backdrop: HTMLElement; key: string; onKey: (event: KeyboardEvent) => void } | undefined;

/**
 * Escape text for HTML (eg. for bodies of windows).
 *
 * @param text text
 * @returns escaped text
 */
export const escapeHtml = (text: string): string =>
    text.replace(/[&<>"]/g, ch => ({ "\"": "&quot;", "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch] ?? ch);

/**
 * Format colour for CSS.
 *
 * @param color colour, with components in [0, 1]
 * @returns CSS colour
 */
const cssColor = (color: RGB): string => `rgb(${color.map(c => Math.round(c * 255).toFixed()).join(" ")})`;

/**
 * Set colours of windows to match canvas.
 *
 * @param background background colour of screen, with components in [0, 1]
 */
export const setWindowColors = (background: RGB): void => {
    const root = document.documentElement.style;
    root.setProperty("--bg", cssColor(background));
    root.setProperty("--fg", cssColor(FG));
    root.setProperty("--dim", cssColor(DIM));
    root.setProperty("--inverse", cssColor(INVERSE));
    root.setProperty("--star", cssColor(STAR));
};

/**
 * Size text of windows to suit screen, with each pixel of font a whole number of device pixels (keeping text
 * crisp), & set height of scanlines to match: one dark row of whole device pixels per font pixel, so that every
 * pixel of text is dimmed alike, wherever text lies or scrolls; call whenever screen is resized or zoomed.
 */
export const setWindowMetrics = (): void => {
    const dpr = window.devicePixelRatio;
    const fit = Math.min(MAX_FONT_PIXEL, window.innerWidth / (7 * MIN_COLUMNS));
    const fontPixel = Math.max(Math.ceil(MIN_FONT_PIXEL * dpr), Math.floor(fit * dpr)); // in device pixels
    const scanPixels = Math.max(1, Math.round(fontPixel / 3)); // dark rows per font pixel, in device pixels

    const root = document.documentElement.style;
    root.setProperty("--font-size", `${(11 * fontPixel / dpr).toString()}px`);
    root.setProperty("--scan-height", `${(scanPixels / dpr).toString()}px`);
    root.setProperty("--scan-fraction", (scanPixels / fontPixel).toString());
};

/**
 * Get key identifying contents of open window.
 *
 * @returns key given when window was opened (or undefined if no window is open)
 */
export const openWindowKey = (): string | undefined => current?.key;

/**
 * Remove open window, if any.
 *
 * @param animate whether to animate window away (else it vanishes at once, eg. when replaced by another)
 */
const removeWindow = (animate: boolean): void => {
    if (!current) return;
    const { backdrop, onKey } = current;
    document.removeEventListener("keydown", onKey);
    current = undefined;
    if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        backdrop.remove();
        return;
    }
    backdrop.classList.remove("open");
    backdrop.addEventListener("transitionend", () => { backdrop.remove(); }, { once: true });
};

/**
 * Close open window, if any, animating it away.
 */
export const closeWindow = (): void => { removeWindow(true); };

/**
 * Check whether pointer event comes from hovering: a mouse or pen moving (rather than eg. content scrolling under
 * it, or a finger dragging to scroll).
 *
 * @param event pointer event
 * @returns whether pointer moved, hovering
 */
const pointerMoved = (event: PointerEvent): boolean =>
    event.pointerType !== "touch" && (event.movementX !== 0 || event.movementY !== 0);

/**
 * Split text into characters, wrapping those matched (see fuzzyMatch()) in spans marking them.
 *
 * @param text text
 * @param offset index (in text matched) of start of text
 * @param indices indices of matched characters, in text matched (if any)
 * @returns characters & spans
 */
const marked = (text: string, offset: number, indices?: Set<number>): (Node | string)[] => {
    const runs: { matched: boolean; text: string }[] = []; // runs of characters alike matched (or not)
    Array.from(text).forEach((ch, i) => {
        const matched = indices?.has(offset + i) ?? false;
        const last = runs.at(-1);
        if (last?.matched === matched) last.text += ch;
        else runs.push({ matched, text: ch });
    });
    return runs.map(({ matched, text: run }) => {
        if (!matched) return run;
        const span = document.createElement("span");
        span.className = "match";
        span.textContent = run;
        return span;
    });
};

// matched characters marked in each entry of index (see filterIndex()), as a key, so that entries whose marks are
// unchanged are left alone
const marksOf = new WeakMap<HTMLElement, string>();

/**
 * Filter index by fuzzy-matching query (see fuzzyMatch()) against entries (their titles, & then bylines, if any),
 * sorting matches best first (& otherwise in original order), & marking matched characters. Only what changes is
 * touched (eg. marks of entries shown, & entries out of place), as each change costs layout & paint (& work by
 * anything observing the page, eg. password managers).
 *
 * @param list index, whose entries each have a data-title, data-order, & link (& maybe a data-byline, & a .byline
 *             showing it)
 * @param query query
 */
const filterIndex = (list: Element, query: string): void => {
    const sorted = [...list.querySelectorAll<HTMLElement>("li")].map(item => {
        const { byline = "", order = "", title = "" } = item.dataset;
        const match = fuzzyMatch(query, byline ? `${title}\n${byline}` : title);
        if (item.hidden !== !match) item.hidden = !match;
        const marks = [...match?.indices ?? []].sort((a, b) => a - b).join(",");
        if (match && (marksOf.get(item) ?? "") !== marks) { // entries hidden are marked once shown again
            marksOf.set(item, marks);
            item.querySelector("a")?.replaceChildren(...marked(title, 0, match.indices));
            item.querySelector(".byline")?.replaceChildren(...marked(byline, title.length + 1, match.indices));
        }
        return { item, order: Number(order), score: match?.score ?? -1 };
    }).sort((a, b) => b.score - a.score || a.order - b.order);

    // move entries out of place into sorted order (each place before i being settled, entry due at i lies after it)
    sorted.forEach(({ item }, i) => {
        const here = list.children[i];
        if (here !== item) list.insertBefore(item, here ?? null);
    });
};

/**
 * Add behaviour to indexes of entries (eg. of recipes) in body of window, if any: typing in filter box (if any)
 * filters them (see filterIndex()), except those marked "pinned", & the entry focused (eg. by tab or arrow keys) is
 * selected, as is the best match in view while filter box is focused & not empty, which enter then opens. Selected
 * entry is shown in inverse video (while keyboard is in use; see openWindow()). Filtering happens at most once per
 * frame, however fast typing is, after which body gets a "filtered" event.
 *
 * @param body body of window
 * @returns function selecting best match in view anew (eg. once others come into view), while filter box is focused
 */
const setupIndex = (body: HTMLElement): (() => void) => {
    const lists = [...body.querySelectorAll<HTMLElement>(".index")];
    const filtered = lists.filter(list => !list.classList.contains("pinned"));
    const filter = body.querySelector<HTMLInputElement>(".filter input");
    filtered.forEach(list => {
        list.querySelectorAll<HTMLElement>("li").forEach((item, i) => { item.dataset.order = i.toString(); });
    });

    let selected: HTMLElement | undefined;
    const select = (entry?: HTMLElement | null): void => {
        selected?.classList.remove("selected");
        selected = entry ?? undefined;
        selected?.classList.add("selected");
    };
    const reselect = (): void => {
        if (!filter || document.activeElement !== filter) return;
        select(filter.value.trim()
            ? filtered.flatMap(list => [...list.querySelectorAll<HTMLElement>("li")])
                .find(item => !item.closest("[hidden]"))
            : undefined);
    };

    lists.forEach(list => {
        list.addEventListener("focusin", e => {
            select(e.target instanceof Element ? e.target.closest<HTMLElement>("li") : undefined);
        });
        list.addEventListener("focusout", e => {
            if (!(e.relatedTarget instanceof Node && list.contains(e.relatedTarget))) select(undefined);
        });
    });
    if (!filter) return reselect;
    filter.addEventListener("focus", () => { select(undefined); });
    filter.addEventListener("blur", () => { select(undefined); });
    let pending = false; // whether filtering awaits next frame
    const update = (): void => {
        pending = false;
        filtered.forEach(list => { filterIndex(list, filter.value); });
        reselect();
        body.dispatchEvent(new Event("filtered"));
    };
    filter.addEventListener("input", () => {
        if (!pending) requestAnimationFrame(() => { if (pending) update(); });
        pending = true;
    });
    filter.addEventListener("keydown", e => {
        if (e.key !== "Enter") return;
        if (pending) update(); // so that enter opens best match for all that was typed
        selected?.querySelector("a")?.click();
    });
    return reselect;
};

/**
 * Add behaviour to tabs in body of window, if any: a tab list (hidden in markup, so that without scripts every
 * panel shows, under its own heading) whose tabs each show their panel (& hide the others) when clicked, or when
 * stepped to (eg. by arrow keys; see openWindow()). Tabs' counts (if any) follow how many entries of their panels
 * match filter box (if any; see setupIndex()).
 *
 * @param body body of window
 * @param reselect function selecting best match in view anew (see setupIndex())
 * @returns function stepping to next or previous tab, wrapping around (or undefined if there are no tabs)
 */
const setupTabs = (body: HTMLElement, reselect: () => void): ((step: -1 | 1) => void) | undefined => {
    const tablist = body.querySelector<HTMLElement>("[role=tablist]");
    const tabs = [...body.querySelectorAll<HTMLElement>("[role=tablist] [role=tab]")];
    if (!tablist || tabs.length === 0) return undefined;
    const panelOf = (tab?: Element): HTMLElement | null =>
        body.querySelector(`[id="${tab?.getAttribute("aria-controls") ?? ""}"]`);

    // focus follows tab within tab list, & moves to new panel from panel hidden
    let current = Math.max(0, tabs.findIndex(tab => tab.getAttribute("aria-selected") === "true"));
    const show = (index: number): void => {
        current = index;
        tabs.forEach((tab, i) => {
            tab.setAttribute("aria-selected", (i === index).toString());
            const panel = panelOf(tab);
            if (panel) panel.hidden = i !== index;
        });
        const [tab, focused] = [tabs[index], document.activeElement];
        if (focused instanceof HTMLElement && tablist.contains(focused)) tab?.focus();
        else if (focused instanceof HTMLElement && focused.closest("[hidden]")) {
            (panelOf(tab)?.querySelector<HTMLElement>("a[href]") ?? tab)?.focus();
        }
        reselect();
    };

    tablist.hidden = false;
    tabs.forEach((tab, i) => { tab.addEventListener("click", () => { show(i); }); });
    body.addEventListener("filtered", () => {
        tabs.forEach(tab => {
            const count = tab.querySelector(".count");
            const matches = (panelOf(tab)?.querySelectorAll(".index li:not([hidden])").length ?? 0).toString();
            if (count && count.textContent !== matches) count.textContent = matches;
        });
    });
    show(current);
    return step => { show((current + step + tabs.length) % tabs.length); };
};

/**
 * Move focus to next or previous item (link or input) of body of window, when it is in view (or nearly so); past
 * last item, or when next item is still far out of view, leave arrow key to scroll body as usual. While filter box
 * is focused, next item is after entry selected in index (see setupIndex()), if any.
 *
 * @param body body of window
 * @param down whether to move down (else up)
 * @returns whether focus moved
 */
const moveFocus = (body: HTMLElement, down: boolean): boolean => {
    const items = [...body.querySelectorAll<HTMLElement>(ITEMS)].filter(item => !item.closest("[hidden]"));
    const filter = body.querySelector(".filter input");
    const active = down && filter && document.activeElement === filter
        ? body.querySelector<HTMLElement>(".index li.selected a") ?? filter
        : document.activeElement;
    const index = items.indexOf(active as HTMLElement);

    // items are measured by rows they lie in (eg. entries of index, or ingredients), if any
    const rowOf = (item: HTMLElement): HTMLElement => item.closest("li") ?? item;
    const view = body.getBoundingClientRect();
    const margin = NEAR_LINES * parseFloat(getComputedStyle(body).lineHeight);
    let target: HTMLElement | undefined;
    if (down) {
        target = items.slice(index + 1).find(item => rowOf(item).getBoundingClientRect().bottom > view.top);
        if (target && rowOf(target).getBoundingClientRect().top > view.bottom + margin) target = undefined;
    } else {
        target = items.slice(0, index === -1 ? undefined : index).reverse()
            .find(item => rowOf(item).getBoundingClientRect().top < view.bottom);
        if (target && rowOf(target).getBoundingClientRect().bottom < view.top - margin) target = undefined;
    }
    if (!target) return false;

    target.focus({ preventScroll: true });
    if (target === items[0]) body.scrollTo({ top: 0 }); // showing heading above, if any
    else rowOf(target).scrollIntoView({ block: "nearest" });
    return true;
};

/**
 * Open window over screen, replacing any open window.
 *
 * @param key key identifying contents of window
 * @param content contents of window
 * @param accent accent colour of window, with components in [0, 1]
 * @param requests handlers of requests made by window
 */
export const openWindow = (key: string, { body: html, title }: WindowContent, accent: RGB,
    requests: WindowRequests): void => {
    const replacing = current !== undefined;
    removeWindow(false);
    const backdrop = document.createElement("div");
    backdrop.className = "window-backdrop";
    backdrop.innerHTML = `
        <section class="window" role="dialog" aria-modal="true" aria-labelledby="window-title">
            <div class="window-frame"></div>
            <header class="window-border top">
                <button class="window-close" aria-label="Close">[■]</button>
                <h1 id="window-title"></h1>
            </header>
            <div class="window-body" tabindex="-1">${html}</div>
            <footer class="window-border bottom"><span></span></footer>
        </section>`;

    const win = backdrop.querySelector<HTMLElement>(".window");
    const body = backdrop.querySelector<HTMLElement>(".window-body");
    const close = backdrop.querySelector<HTMLElement>(".window-close");
    const heading = backdrop.querySelector("h1");
    const status = backdrop.querySelector("footer span");
    if (!win || !body || !close || !heading || !status) return;
    const reselect = setupIndex(body);
    const step = setupTabs(body, reselect);
    heading.textContent = title;
    const arrows = `↑↓ ${body.querySelector(ITEMS) ? "select" : "scroll"}`;
    status.textContent = ["esc close", ...step ? ["←→ tab"] : [], arrows].join(" · ");
    win.style.setProperty("--accent", cssColor(accent));

    backdrop.addEventListener("pointerdown", e => { if (e.target === backdrop) requests.close(); });
    close.addEventListener("click", requests.close);
    body.addEventListener("click", e => { // links within site are left to opener
        const href = e.target instanceof Element ? e.target.closest("a")?.getAttribute("href") : undefined;
        if (!href?.startsWith("#")) return;
        e.preventDefault();
        requests.link(href.slice(1));
    });
    // only one highlight is shown: the item hovered, once pointer moves onto one, & otherwise the item focused, if
    // focus was given by keyboard (& not since cleared by clicking); see "hovering" & "keyboard" in style.css
    const setHovering = (hovered: boolean): void => { win.classList.toggle("hovering", hovered); };
    win.addEventListener("pointermove", e => {
        if (pointerMoved(e)) setHovering(e.target instanceof Element && e.target.closest(HOVERABLE) !== null);
    });
    win.addEventListener("pointerleave", () => { setHovering(false); });
    win.addEventListener("pointerdown", () => { win.classList.remove("keyboard"); });

    // handle keys wherever focus is (even if it escapes window, eg. by clicking): escape clears filter box (if any,
    // & not empty) or else closes window, tab cycles through what can be focused, up & down arrow keys move focus
    // (see moveFocus()), left & right arrow keys step through tabs (if any, unless moving caret through text in
    // filter box), & typing goes to filter box, if any
    const filter = body.querySelector<HTMLInputElement>(".filter input");
    const onKey = (e: KeyboardEvent): void => {
        win.classList.add("keyboard");
        setHovering(false);
        if (e.key === "Escape") {
            e.stopPropagation(); // as window may close at once, before terminal would see key (& go back further)
            e.preventDefault(); // eg. search box clearing itself too
            if (filter && filter.value !== "") {
                filter.value = "";
                filter.dispatchEvent(new Event("input")); // filtering anew (see setupIndex())
            } else requests.close();
        } else if (e.key === "Tab") {
            e.preventDefault();
            const focusable = [...win.querySelectorAll<HTMLElement>(FOCUSABLE)]
                .filter(element => !element.closest("[hidden]"));
            const index = focusable.indexOf(document.activeElement as HTMLElement);
            const next = index === -1 ? 0 : index + (e.shiftKey ? -1 : 1);
            focusable[(next + focusable.length) % focusable.length]?.focus();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (moveFocus(body, e.key === "ArrowDown")) e.preventDefault();
            else if (!body.contains(document.activeElement)) body.focus(); // so that key scrolls body
        } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && step
            && !(filter && document.activeElement === filter && filter.value !== "")) {
            e.preventDefault();
            step(e.key === "ArrowLeft" ? -1 : 1);
        } else if (filter && document.activeElement !== filter && (e.key.length === 1 || e.key === "Backspace")
            && !e.ctrlKey && !e.metaKey && !e.altKey) {
            filter.focus(); // before default action of key, which then types into filter box
        }
    };
    document.addEventListener("keydown", onKey);

    document.body.append(backdrop);
    current = { backdrop, key, onKey };
    // lay out closed window first, so that opening animates, unless it replaces another (eg. following link from
    // one to other), which it then does at once
    if (!replacing) backdrop.getBoundingClientRect();
    backdrop.classList.add("open");

    // focus filter box (if any) or else body, once event opening window (eg. a click) is done, as its default action
    // may otherwise take focus away
    setTimeout(() => { (filter ?? body).focus(); });
};
