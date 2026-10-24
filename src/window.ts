import type { RGB } from "types/global";

import { DIM, FG, INVERSE } from "palette";
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
const HOVERABLE = "a[href], button, .checklist label, .index li";

// open window, key identifying its contents, & listener handling keys while it is open
let current: { backdrop: HTMLElement; key: string; onKey: (event: KeyboardEvent) => void } | undefined;

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
 * Filter index by fuzzy-matching query (see fuzzyMatch()) against titles of entries, sorting matches best first
 * (& otherwise in original order), & marking matched characters.
 *
 * @param list index, whose entries each have a data-title & a link
 * @param query query
 */
const filterIndex = (list: Element, query: string): void => {
    const items = [...list.querySelectorAll<HTMLElement>("li")];
    items.map((item, order) => ({ item, match: fuzzyMatch(query, item.dataset.title ?? ""), order }))
        .sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1) || a.order - b.order)
        .forEach(({ item, match }) => {
            item.hidden = !match;
            const title = item.dataset.title ?? "";
            item.querySelector("a")?.replaceChildren(...Array.from(title, (ch, i) => {
                if (!match?.indices.has(i)) return ch;
                const span = document.createElement("span");
                span.className = "match";
                span.textContent = ch;
                return span;
            }));
            list.append(item); // in sorted order
        });
};

/**
 * Add behaviour to index of entries (eg. of recipes) in body of window, if any: typing in filter box above it (if
 * any) filters it (see filterIndex()), & the entry focused (eg. by tab or arrow keys) is selected, as is the best
 * match while filter box is focused & not empty, which enter then opens. Selected entry is shown in inverse video
 * (while keyboard is in use; see openWindow()).
 *
 * @param body body of window
 */
const setupIndex = (body: HTMLElement): void => {
    const list = body.querySelector<HTMLElement>(".index");
    if (!list) return;
    const filter = body.querySelector<HTMLInputElement>(".filter input");

    let selected: HTMLElement | undefined;
    const select = (entry?: HTMLElement | null): void => {
        selected?.classList.remove("selected");
        selected = entry ?? undefined;
        selected?.classList.add("selected");
    };

    list.addEventListener("focusin", e => {
        select(e.target instanceof Element ? e.target.closest<HTMLElement>("li") : undefined);
    });
    list.addEventListener("focusout", e => {
        if (!(e.relatedTarget instanceof Node && list.contains(e.relatedTarget))) select(undefined);
    });
    if (!filter) return;
    filter.addEventListener("focus", () => { select(undefined); });
    filter.addEventListener("blur", () => { select(undefined); });
    filter.addEventListener("input", () => {
        filterIndex(list, filter.value);
        select(filter.value.trim() ? list.querySelector<HTMLElement>("li:not([hidden])") : undefined);
    });
    filter.addEventListener("keydown", e => { if (e.key === "Enter") selected?.querySelector("a")?.click(); });
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
    heading.textContent = title;
    status.textContent = `esc close · ↑↓ ${body.querySelector(ITEMS) ? "select" : "scroll"}`;
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

    // handle keys wherever focus is (even if it escapes window, eg. by clicking): escape closes window, tab cycles
    // through what can be focused, arrow keys move focus (see moveFocus()), & typing goes to filter box, if any
    const filter = body.querySelector<HTMLInputElement>(".filter input");
    const onKey = (e: KeyboardEvent): void => {
        win.classList.add("keyboard");
        setHovering(false);
        if (e.key === "Escape") {
            e.stopPropagation(); // as window may close at once, before terminal would see key (& go back further)
            requests.close();
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
    setupIndex(body);

    // focus filter box (if any) or else body, once event opening window (eg. a click) is done, as its default action
    // may otherwise take focus away
    setTimeout(() => { (filter ?? body).focus(); });
};
