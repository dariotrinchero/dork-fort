import type { Line, RGB, Segment } from "types/global";
import type { Shell } from "shell";
import type { TextLayout } from "types/menu";

import type QRMenu from "menu";
import type TextRenderer from "textRenderer";

import { DIM, FG, GHOST } from "palette";
import { PLACES, execute, highlight, resolve, suggest } from "shell";

const PROMPT = ">> "; // prompt always shown before command
const HINT = " type 'help', or tap the picture"; // shown after prompt until first interaction (cursor covers space)
const TYPE_RATE = 40; // characters of suggestion typed per second
const ERASE_RATE = 80; // characters of suggestion erased per second
const CURSOR_BLINK = 0.5; // time (in seconds) for which cursor is alternately shown & hidden
const WHEEL_ROWS = 3; // rows of output scrolled per mouse wheel step
const MIN_HANG_COLS = 12; // minimum width of text beside hanging indent, below which wrapped text is not indented

// character of text, in its colour
interface Cell {
    ch: string;
    color: RGB;
}

// output of command
interface View {
    echo: Line;                              // command, as typed
    lines: { indent: number; line: Line }[]; // lines of output, before wrapping, with hanging indents
    scroll: number;                          // rows of (wrapped) output scrolled past
    closing: boolean;                        // whether output is being hidden
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

export default class Terminal implements Shell {
    private text?: TextRenderer;
    private view?: View; // output shown, kept until menu has finished hiding it
    private version = 0; // count of changes to output, identifying it
    private echo: Line = []; // command being run
    private suggestion = { chars: 0, text: "" }; // command suggested by hovering, typed & erased one character at a time
    private interacted = false; // whether user has interacted yet (hiding hint)
    private pageRows = 0; // rows of output visible at once, when last drawn
    private shownKey = ""; // key identifying text currently written to text renderer

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

        // focus input on click, or on tapping below QR code (where prompt is), raising keyboard on touch screens
        canvas.addEventListener("pointerup", e => { if (e.pointerType === "mouse" || menu.isBelowQR(e)) input.focus(); });
        canvas.addEventListener("wheel", e => { this.scroll(Math.sign(e.deltaY) * WHEEL_ROWS); }, { passive: true });
        window.addEventListener("keydown", e => { this.keyDown(e); });
        input.focus();
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
        this.view = { closing: false, echo: this.echo, lines: [], scroll: 0 };
        this.version++;
        this.suggestion = { chars: 0, text: "" };
        this.menu.open(place);
    }

    public back(): void {
        if (!this.view) return;
        this.menu.close();
        this.view.closing = true;

        // command slides back down onto prompt, which takes over showing it (as if suggested) once it lands
        const text = this.view.echo.map(({ text }) => text).join("");
        this.suggestion = { chars: text.length, text };
    }

    public print(...segments: (Segment | string)[]): void {
        this.view?.lines.push({ indent: 0, line: toLine(segments) });
        this.version++;
    }

    public columns(width: number, left: (Segment | string)[], right: (Segment | string)[]): void {
        const length = left.reduce((sum, s) => sum + (typeof s === "string" ? s : s.text).length, 0);
        const gap = " ".repeat(Math.max(1, width - length));
        this.view?.lines.push({ indent: width, line: toLine([...left, gap, ...right]) });
        this.version++;
    }

    /**
     * Run command, adding it to history.
     *
     * @param line command
     */
    private run(line: string): void {
        if (line.trim() !== "") this.history.push(line);
        this.historyIndex = this.history.length;
        this.echo = highlight(line);
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

        const { value } = this.input;
        const ghost = suggest(value);
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
        const { value } = this.input;
        const ghost = suggest(value);
        if (value !== "" || this.menu.hovered() !== undefined) this.interacted = true;

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
            this.suggestion.text, Math.floor(this.suggestion.chars), this.view && this.version, this.view?.scroll, this.view?.closing,
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
     * overflows.
     *
     * @param text text renderer
     * @param layout layout of text
     * @returns bottom of command (in pixels from top of output)
     */
    private drawView(text: TextRenderer, { echoTop, left, paneBottom, right }: TextLayout): number {
        if (!this.view) return echoTop;
        const [cols] = text.fit([left, echoTop, right, Infinity]);
        const echo = wrap(toCells([{ color: FG, text: PROMPT }, ...this.view.echo]), cols);
        text.setBox([left, echoTop, right, Infinity]);
        Terminal.printRows(text, echo);

        const outTop = echoTop + echo.length * text.getCharDims()[1];
        const [, rows] = text.fit([left, outTop, right, paneBottom]);
        const lines = this.view.lines.flatMap(({ indent, line }) => wrap(toCells(line), cols, indent));
        const overflow = lines.length > rows;
        this.pageRows = Math.max(0, overflow ? rows - 1 : rows); // when overflowing, last row shows scroll status
        const maxScroll = Math.max(0, lines.length - this.pageRows);
        const scroll = this.view.scroll = Math.max(0, Math.min(maxScroll, this.view.scroll));

        text.setBox([left, outTop, right, paneBottom]);
        Terminal.printRows(text, lines.slice(scroll, scroll + this.pageRows));
        if (overflow) {
            const percent = Math.round(100 * (scroll + this.pageRows) / lines.length);
            text.print(scroll < maxScroll ? `-- more (${percent.toFixed()}%) --` : "-- end --", DIM);
        }
        return outTop;
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
            ? toCells(highlight(this.suggestion.text)).slice(0, Math.floor(this.suggestion.chars))
            : toCells(highlight(value));
        const ghost = value !== "" ? suggest(value) : this.interacted || typed.length > 0 ? "" : HINT;
        const cells = toCells([{ color: FG, text: PROMPT }]).concat(typed, toCells([{ color: GHOST, text: ghost }]));

        // block cursor covers character after caret (or a space at end)
        const cursorCell = PROMPT.length + (value === "" ? typed.length : caret);
        if (cursorCell >= cells.length) cells.push({ ch: " ", color: FG });
        if (cursor) cells[cursorCell] = { ch: "█", color: FG };

        text.setBox([left, promptTop, right, Infinity]);
        Terminal.printRows(text, wrap(cells, text.fit([left, promptTop, right, Infinity])[0]));
    }
}
