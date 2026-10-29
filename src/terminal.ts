import type { Line, RGB, Rect, Segment } from "types/global";
import type { Shell } from "shell";
import type { TextLayout } from "types/menu";

import type QRMenu from "menu";
import type TextRenderer from "textRenderer";

import { DIM, FG, GHOST, INVERSE } from "palette";
import { PLACES, execute, highlight, menuOf, resolve, suggest, windowOf } from "shell";
import { closeWindow, openWindow, openWindowKey } from "window";
import { currentRoute, goBack, goTo, onRouteChange } from "route";

const PROMPT = ">> "; // prompt always shown before command
const HINT = " type 'help' or tap QR code"; // shown after prompt until first interaction (cursor covers space)
const TYPE_RATE = 40; // characters of suggestion typed per second
const ERASE_RATE = 80; // characters of suggestion erased per second
const OUTPUT_RATE = 160; // characters of output typed per second, when typed out (see typeOut())
const CURSOR_BLINK = 0.5; // time (in seconds) for which cursor is alternately shown & hidden
const WHEEL_ROWS = 3; // rows of output scrolled per mouse wheel step
const MIN_HANG_COLS = 12; // minimum width of text beside hanging indent, below which wrapped text is not indented
const MIN_ASIDE_COLS = 12; // narrowest space beside icon in which lines are shown (rather than among other lines)
const LINK_ROWS = 2; // most rows taken by clickable line, beyond which it is truncated

// character of text, in its colour
interface Cell {
    ch: string;
    color: RGB;
}

// line of output, before wrapping, with hanging indent, command run on clicking it (if any), & whether it is meant
// for space beside icon of place shown
interface OutputLine {
    indent: number;
    line: Line;
    command?: string;
    aside: boolean;
}

// row of output, after wrapping, & line it was wrapped from
interface Row {
    cells: Cell[];
    command?: string;
    source: OutputLine;
}

// output of command
interface View {
    place?: number;       // index of place shown (if any)
    echo: Line;           // command, as typed
    lines: OutputLine[];  // lines of output
    scroll: number;       // rows of (wrapped) output scrolled past
    closing: boolean;     // whether output is being hidden
    typed?: number;       // characters of output typed so far, while typing it out (see typeOut())
}

// clickable row of output, as last drawn
interface LinkRow {
    command: string;
    top: number;    // in pixels from top of output
    bottom: number;
    left: number;   // in pixels from left of output
    right: number;
}

/**
 * Split line of text into characters.
 *
 * @param line segments of text
 * @returns cells of text
 */
const toCells = (line: Line): Cell[] => line.flatMap(({ color, text }) => Array.from(text, ch => ({ ch, color })));

/**
 * Convert segments & strings (which take default colour) into line of text.
 *
 * @param segments segments & strings
 * @returns segments of line
 */
const toLine = (segments: (Segment | string)[]): Line =>
    segments.map(s => typeof s === "string" ? { color: FG, text: s } : s);

/**
 * Word-wrap text into rows of at most given width, breaking at (& dropping) the last space that fits, if any.
 * Rows after the first are indented, unless that leaves fewer than MIN_HANG_COLS columns.
 *
 * @param cells cells of text
 * @param cols width of each row, in characters
 * @param indent hanging indent, in characters
 * @returns rows of text
 */
const wrap = (cells: Cell[], cols: number, indent = 0): Cell[][] => {
    if (cols <= 0) return [];
    const hang = cols - indent >= MIN_HANG_COLS ? indent : 0;
    const rows: Cell[][] = [];
    let [rest, width] = [cells, cols];
    while (rest.length > width) {
        const space = rest.slice(0, width + 1).findLastIndex(({ ch }) => ch === " ");
        const end = space > 0 ? space : width;
        rows.push(rest.slice(0, end));
        rest = rest.slice(rest[end]?.ch === " " ? end + 1 : end);
        width = cols - hang;
    }
    const padding = Array.from({ length: hang }, (): Cell => ({ ch: " ", color: FG }));
    return [...rows, rest].map((row, i) => i === 0 ? row : [...padding, ...row]);
};

/**
 * Wrap lines of output into rows, keeping clickable lines to LINK_ROWS rows each (ending them with an ellipsis if
 * cut short).
 *
 * @param lines lines of output
 * @param cols width of each row, in characters
 * @returns rows of output
 */
const toRows = (lines: OutputLine[], cols: number): Row[] => lines.flatMap(source => {
    const { command, indent, line } = source;
    const rows = wrap(toCells(line), cols, indent);
    if (command === undefined) return rows.map(cells => ({ cells, source }));
    if (rows.length > LINK_ROWS) { // end last row kept with ellipsis, in place of its last character if it is full
        const last = rows[LINK_ROWS - 1] ?? [];
        rows.splice(LINK_ROWS - 1, Infinity, [...last.slice(0, cols - 1), { ch: "…", color: DIM }]);
    }
    return rows.map(cells => ({ cells, command, source }));
});

export default class Terminal implements Shell {
    private text?: TextRenderer;
    private view?: View; // output shown, kept until menu has finished hiding it
    private version = 0; // count of changes to output, identifying it
    private echo: Line = []; // command being run
    private suggestion = { chars: 0, text: "" }; // command suggested by hovering, typed & erased one character at a time
    private interacted = false; // whether user has interacted yet (hiding hint)
    private pageRows = 0; // rows of output visible at once, when last drawn
    private shownKey = ""; // key identifying text currently written to text renderer
    private links: LinkRow[] = []; // clickable rows of output
    private hoveredLink?: string; // command of clickable row under pointer
    private routing = false; // whether following route (so that views shown & hidden don't navigate in turn)
    private printingAside = false; // whether lines printed are meant for space beside icon (see aside())

    // previous commands, index of command recalled (history.length if none), & command typed before recalling
    private history: string[] = [];
    private historyIndex = 0;
    private draft = "";

    constructor(
        canvas: HTMLCanvasElement,
        private input: HTMLInputElement, // hidden input, receiving keystrokes (incl. from touch screen keyboards)
        private menu: QRMenu,
    ) {
        menu.onChoose = index => { this.run(PLACES[index]?.phrase ?? ""); };
        menu.onDismiss = () => { this.back(); };
        menu.claimPress = e => { // clicking link runs its command
            const command = this.linkAt(e);
            if (command !== undefined) this.run(command);
            return command !== undefined;
        };

        // focus input on click, or on tapping below QR code (where prompt is), raising keyboard on touch screens
        canvas.addEventListener("pointerup", e => { if (e.pointerType === "mouse" || menu.isBelowQR(e)) input.focus(); });
        canvas.addEventListener("pointermove", e => { // menu sets cursor first (see QRMenu.pointAt())
            this.hoveredLink = this.linkAt(e);
            if (this.hoveredLink !== undefined) canvas.style.cursor = "pointer";
        });
        canvas.addEventListener("pointerleave", () => { this.hoveredLink = undefined; });
        canvas.addEventListener("wheel", e => { this.scroll(Math.sign(e.deltaY) * WHEEL_ROWS); }, { passive: true });
        window.addEventListener("keydown", e => { this.keyDown(e); });
        input.focus();

        // show what URL points at, & follow it as it changes
        onRouteChange(route => { this.follow(route); });
        this.follow(currentRoute());
    }

    /**
     * Find clickable row of output under pointer.
     *
     * @param event pointer event
     * @returns command of clickable row (or undefined if none)
     */
    private linkAt(event: PointerEvent): string | undefined {
        if (!this.view || this.view.closing) return undefined;
        const [x, y] = this.menu.pointerPixel(event);
        return this.links.find(({ bottom, left, right, top }) => x >= left && x < right && y >= top && y < bottom)
            ?.command;
    }

    /**
     * Show what given route points at (place shown, & window open over it), without navigating in turn.
     *
     * @param route route, eg. ["campfire", "cookbook"]
     */
    private follow([name, item]: string[]): void {
        this.routing = true;
        const place = PLACES.findIndex(({ words: [word] }) => word === name);
        if (place === -1) {
            closeWindow();
            if (this.view?.place !== undefined) this.back();
        } else {
            if (this.view?.place !== place || this.view.closing) this.run(PLACES[place]?.phrase ?? "", false);
            const content = item === undefined ? undefined : windowOf(place, item);
            const key = `${name ?? ""}/${item ?? ""}`;
            if (!content) closeWindow();
            else if (openWindowKey() !== key) {
                openWindow(key, content, PLACES[place]?.accent ?? FG, {
                    close: () => { this.leaveWindow(); },
                    link: hash => { // links to items without windows yet do nothing
                        const route = hash.split("/");
                        const [target, entry] = [PLACES.findIndex(({ words: [word] }) => word === route[0]), route[1]];
                        if (entry === undefined || (target !== -1 && windowOf(target, entry))) goTo(route);
                    },
                });
            }
        }
        this.routing = false;
    }

    /**
     * Close open window, going back to whatever it was opened from within the same place (eg. another window), or
     * else to the place itself.
     */
    private leaveWindow(): void {
        const [name = ""] = currentRoute();
        goBack([name], ([from]) => from === name);
    }

    /**
     * Set text renderer used to show text (which may only become available once its font has loaded).
     *
     * @param text text renderer
     */
    public setTextRenderer(text: TextRenderer): void {
        this.text = text;
    }

    /**
     * Get length of longest line suggested by hovering, ie. longest canonical command with prompt & cursor.
     *
     * @returns length of longest line, in characters
     */
    public maxLineLength(): number {
        return PROMPT.length + Math.max(0, ...PLACES.map(({ phrase }) => phrase.length)) + 1;
    }

    public show(place?: number): void {
        this.view = { closing: false, echo: this.echo, lines: [], place, scroll: 0 };
        this.version++;
        this.suggestion = { chars: 0, text: "" };
        this.menu.open(place);
        if (!this.routing) goTo(place === undefined ? [] : [PLACES[place]?.words[0] ?? ""]);
    }

    public back(): void {
        if (!this.view) return;
        this.menu.close();
        this.view.closing = true;
        if (!this.routing) goBack([], from => from.length === 0); // back to menu

        // command slides back down onto prompt, which takes over showing it (as if suggested) once it lands
        const text = this.view.echo.map(({ text }) => text).join("");
        this.suggestion = { chars: text.length, text };
    }

    public typeOut(): void {
        if (this.view) this.view.typed = 0;
    }

    public print(...segments: (Segment | string)[]): void {
        this.view?.lines.push({ aside: this.printingAside, indent: 0, line: toLine(segments) });
        this.version++;
    }

    public link(command: string, indent: number, ...segments: (Segment | string)[]): void {
        this.view?.lines.push({ aside: this.printingAside, command, indent, line: toLine(segments) });
        this.version++;
    }

    public aside(print: () => void): void {
        this.printingAside = true;
        try {
            print();
        } finally {
            this.printingAside = false;
        }
    }

    public go(route: string[]): void {
        goTo(route);
    }

    public shown(): number | undefined {
        return this.view?.closing ? undefined : this.view?.place;
    }

    public columns(width: number, left: (Segment | string)[], right: (Segment | string)[]): void {
        const length = left.reduce((sum, s) => sum + (typeof s === "string" ? s : s.text).length, 0);
        const gap = " ".repeat(Math.max(1, width - length));
        this.view?.lines.push({ aside: this.printingAside, indent: width, line: toLine([...left, gap, ...right]) });
        this.version++;
    }

    /**
     * Run command, adding it to history.
     *
     * @param line command
     * @param remember whether to add command to history
     */
    private run(line: string, remember = true): void {
        const entry = line.trim();
        if (remember && entry !== "") this.history = [...this.history.filter(previous => previous !== entry), entry];
        this.historyIndex = this.history.length;
        this.echo = highlight(line, this.shown());
        execute(this, line);
    }

    /**
     * Replace text in input, moving caret to its end.
     *
     * @param value new text
     */
    private setInput(value: string): void {
        this.input.value = value;
        this.input.setSelectionRange(value.length, value.length);
    }

    /**
     * Recall previous or next command from history.
     *
     * @param step -1 for previous command, or 1 for next
     */
    private recall(step: -1 | 1): void {
        const index = Math.max(0, Math.min(this.history.length, this.historyIndex + step));
        if (index === this.historyIndex) return;
        if (this.historyIndex === this.history.length) this.draft = this.input.value;
        this.historyIndex = index;
        this.setInput(this.history[index] ?? this.draft);
    }

    /**
     * Scroll output.
     *
     * @param rows rows to scroll by (negative to scroll up)
     */
    private scroll(rows: number): void {
        if (this.view) this.view.scroll += rows;
    }

    /**
     * Handle key press: escape goes back, & any other key focuses input (so typing anywhere reaches prompt).
     *
     * @param event keyboard event
     */
    private keyDown(event: KeyboardEvent): void {
        this.interacted = true;
        if (event.isComposing) return;

        // while window is open, keys are left to it (see window.ts)
        if (openWindowKey() !== undefined) return;
        const { key } = event;
        if (key === "Escape") {
            if (this.view) this.back();
            else this.setInput("");
            return;
        }
        if (key === "PageUp" || key === "PageDown") {
            this.scroll((key === "PageUp" ? -1 : 1) * Math.max(1, this.pageRows - 1));
            event.preventDefault();
            return;
        }
        if (document.activeElement !== this.input) this.input.focus();

        // digits pick entries of menu of place shown, while prompt is empty
        const { value } = this.input;
        const hotkey = value === "" ? menuOf(this.shown()).find(entry => entry.key === key) : undefined;
        if (hotkey) {
            this.run(hotkey.name);
            event.preventDefault();
            return;
        }

        const ghost = suggest(value, this.shown());
        if (key === "Enter") {
            this.setInput("");
            this.run(value);
        } else if (key === "Tab" || (key === "ArrowRight" && this.input.selectionStart === value.length && ghost)) {
            if (ghost) this.setInput(value + ghost);
            event.preventDefault(); // tab never moves focus away from prompt, even with nothing to complete
        } else if (key === "ArrowUp" || key === "ArrowDown") {
            this.recall(key === "ArrowUp" ? -1 : 1);
            event.preventDefault();
        }
    }

    /**
     * Advance suggestion animation, & redraw text if it changed.
     *
     * @param dt time (in seconds) since last update
     * @param time current time (in seconds)
     */
    public update(dt: number, time: number): void {
        if (!this.menu.isOpen()) this.view = undefined;
        if (!this.view) this.links = [];
        const { value } = this.input;
        const ghost = suggest(value, this.shown());
        if (value !== "" || this.menu.hovered() !== undefined) this.interacted = true;
        if (this.view?.typed !== undefined) this.view.typed += OUTPUT_RATE * dt;

        // while typing, highlight destination named by command (with its suggested completion)
        this.menu.highlight(value === "" ? null : resolve(value + ghost));

        // type command of hovered destination as suggestion, erasing previous suggestion first (paused while output
        // is shown, so that prompt takes over showing command once output is hidden)
        if (!this.view) {
            const hovered = this.menu.hovered();
            const target = value === "" && hovered !== undefined ? PLACES[hovered]?.phrase ?? "" : "";
            if (this.suggestion.text !== target) {
                this.suggestion.chars -= ERASE_RATE * dt;
                if (this.suggestion.chars <= 0) this.suggestion = { chars: 0, text: target };
            } else {
                this.suggestion.chars = Math.min(target.length, this.suggestion.chars + TYPE_RATE * dt);
            }
        }

        // rewrite text only when it changes, to avoid needless buffer uploads
        if (!this.text) return;
        const layout = this.menu.textLayout();
        const caret = this.input.selectionStart ?? value.length;
        const cursor = Math.floor(time / CURSOR_BLINK) % 2 === 0;
        const { echoTop, left, paneBottom, promptTop, right } = layout;
        const key = [
            echoTop, left, paneBottom, promptTop, right, ...this.text.getCharDims(), value, caret, cursor, this.interacted,
            this.suggestion.text, Math.floor(this.suggestion.chars), this.view && this.version, this.view?.scroll, this.view?.closing, this.hoveredLink,
            this.view?.typed === undefined ? "" : Math.floor(this.view.typed),
        ].join("|");
        if (key === this.shownKey) return;
        this.shownKey = key;

        this.text.clear();
        // prompt is hidden while command slides away from it (until clear of it) & back onto it (until it lands)
        const echoBottom = this.view ? this.drawView(this.text, layout) : promptTop;
        if (!this.view?.closing && echoBottom <= promptTop) this.drawPrompt(this.text, layout, caret, cursor);
    }

    /**
     * Print rows of text in current box of text renderer.
     *
     * @param text text renderer
     * @param rows rows of text
     */
    private static printRows(text: TextRenderer, rows: Cell[][]): void {
        rows.forEach(row => {
            row.forEach(({ ch, color }) => { text.print(ch, color); });
            text.print("\n");
        });
    }

    /**
     * Draw command whose output is shown, & its output below it, clipped to bottom of QR code & scrollable if it
     * overflows. Lines meant for beside icon of place shown are drawn there if they fit, & otherwise among the rest.
     *
     * @param text text renderer
     * @param layout layout of text
     * @returns bottom of command (in pixels from top of output)
     */
    private drawView(text: TextRenderer, { aside, echoTop, left, paneBottom, right }: TextLayout): number {
        if (!this.view) return echoTop;
        const [cols] = text.fit([left, echoTop, right, Infinity]);
        const echo = wrap(toCells([{ color: FG, text: PROMPT }, ...this.view.echo]), cols);
        text.setBox([left, echoTop, right, Infinity]);
        Terminal.printRows(text, echo);
        this.links = [];

        const asideLines = this.view.lines.filter(line => line.aside);
        const [asideCols, asideHeight] = aside ? text.fit(aside) : [0, 0];
        const asideRows = toRows(asideLines, asideCols);
        const asideFits = asideLines.length > 0 && asideCols >= MIN_ASIDE_COLS && asideRows.length <= asideHeight;

        const charHeight = text.getCharDims()[1];
        const outTop = echoTop + echo.length * charHeight;
        const [, visibleRows] = text.fit([left, outTop, right, paneBottom]);
        // lines meant for beside icon, printed among others instead, are set apart from lines before them by a blank
        // line
        const inline = this.view.lines.flatMap((line, i, lines) =>
            line.aside && i > 0 && !lines[i - 1]?.aside ? [{ aside: false, indent: 0, line: [] }, line] : [line]);
        const rows = toRows(asideFits ? this.view.lines.filter(line => !line.aside) : inline, cols);
        if (this.typeRows(asideFits ? [...asideRows, ...rows] : rows)) this.view.typed = undefined;
        if (aside && asideFits) this.drawRows(text, asideRows, aside, asideCols);

        const overflow = rows.length > visibleRows;
        this.pageRows = Math.max(0, overflow ? visibleRows - 1 : visibleRows); // when overflowing, last row shows status
        const maxScroll = Math.max(0, rows.length - this.pageRows);
        const scroll = this.view.scroll = Math.max(0, Math.min(maxScroll, this.view.scroll));
        this.drawRows(text, rows.slice(scroll, scroll + this.pageRows), [left, outTop, right, paneBottom], cols);

        text.setBox([left, outTop + this.pageRows * charHeight, right, paneBottom]);
        if (overflow) {
            const percent = Math.round(100 * (scroll + this.pageRows) / rows.length);
            text.print(scroll < maxScroll ? `-- more (${percent.toFixed()}%) --` : "-- end --", DIM);
        }
        return outTop;
    }

    /**
     * While typing out output, cut rows short to the characters typed so far, typing lines in the order printed
     * (wherever they are drawn). Rows not yet fully typed aren't clickable.
     *
     * @param rows rows of output (modified in place)
     * @returns whether all rows are fully typed
     */
    private typeRows(rows: Row[]): boolean {
        if (this.view?.typed === undefined) return true;
        let [chars, done] = [Math.floor(this.view.typed), true];
        this.view.lines.forEach(line => {
            rows.filter(({ source }) => source === line).forEach(row => {
                const shown = Math.min(chars, row.cells.length);
                if (shown < row.cells.length) {
                    [row.cells, row.command, done] = [row.cells.slice(0, shown), undefined, false];
                }
                chars -= shown;
            });
        });
        return done;
    }

    /**
     * Draw rows of output from top of given box, each in its own box (so that clickable rows can be drawn in inverse
     * video when hovered), recording where clickable rows are.
     *
     * @param text text renderer
     * @param rows rows of output
     * @param box left, top, right, & bottom of box (in pixels from top-left of output)
     * @param cols width of box, in characters
     */
    private drawRows(text: TextRenderer, rows: Row[], [left, top, right, bottom]: Rect, cols: number): void {
        const [charWidth, charHeight] = text.getCharDims();
        const bar = PLACES[this.view?.place ?? -1]?.accent ?? FG;
        rows.forEach(({ cells, command }, i) => {
            const rowTop = top + i * charHeight;
            const hovered = command !== undefined && command === this.hoveredLink && !this.view?.closing;
            if (hovered) {
                text.setBox([left, rowTop, right, bottom]);
                text.print("█".repeat(cols), bar);
            }
            text.setBox([left, rowTop, right, bottom]);
            cells.forEach(({ ch, color }) => { text.print(ch, hovered ? INVERSE : color); });
            if (command !== undefined) {
                this.links.push({ bottom: rowTop + charHeight, command, left, right: left + cols * charWidth, top: rowTop });
            }
        });
    }

    /**
     * Draw prompt, followed by command being typed (& its suggested completion), or else command suggested by
     * hovering, or before first interaction, a hint.
     *
     * @param text text renderer
     * @param layout layout of text
     * @param caret position of caret in command being typed
     * @param cursor whether cursor is shown (rather than hidden, while blinking)
     */
    private drawPrompt(text: TextRenderer, { left, promptTop, right }: TextLayout, caret: number, cursor: boolean): void {
        const { value } = this.input;
        const typed = value === ""
            ? toCells(highlight(this.suggestion.text, this.shown())).slice(0, Math.floor(this.suggestion.chars))
            : toCells(highlight(value, this.shown()));
        const ghost = value !== "" ? suggest(value, this.shown()) : this.interacted || typed.length > 0 ? "" : HINT;
        const cells = toCells([{ color: FG, text: PROMPT }]).concat(typed, toCells([{ color: GHOST, text: ghost }]));

        // block cursor covers character after caret (or a space at end)
        const cursorCell = PROMPT.length + (value === "" ? typed.length : caret);
        if (cursorCell >= cells.length) cells.push({ ch: " ", color: FG });
        if (cursor) cells[cursorCell] = { ch: "█", color: FG };

        text.setBox([left, promptTop, right, Infinity]);
        Terminal.printRows(text, wrap(cells, text.fit([left, promptTop, right, Infinity])[0]));
    }
}
