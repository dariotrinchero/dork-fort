import type { Pos, RGB } from "types/global";
import type { Destination } from "types/destinations";

import type QRRenderer from "qrRenderer";
import type TextRenderer from "textRenderer";

import { parseHex } from "palette";
import { warpUV } from "warp";

const HOVER_TIME = 0.15; // time constant (in seconds) of hover fade in & out
const TYPE_RATE = 60; // characters of label typed per second
const ERASE_RATE = 120; // characters of label erased per second
const CURSOR_BLINK = 0.5; // time (in seconds) for which cursor is alternately shown & hidden
const LABEL_COLOR: RGB = [0.92, 0.9, 0.85];
const ACCENT_BOOST = 1.5; // brightness multiplier for accent colours, to match hovered region (see BOOST in qr.frag)
const PROMPT = ">> "; // prompt always shown before label
const LABEL_GAP = 2; // gap (in QR code modules) between QR code & label
const SELECT_TIME = 0.5; // duration (in seconds) of selection animation, & of its reversal

// run of label text in a single colour
interface Segment {
    text: string;
    color: RGB;
}

/**
 * Get total length of label.
 *
 * @param segments segments of label
 * @returns number of characters in label
 */
const labelLength = (segments: Segment[]): number => segments.reduce((sum, { text }) => sum + text.length, 0);

/**
 * Ease in & out of animation.
 *
 * @param t linear progress of animation, in [0, 1]
 * @returns eased progress of animation, in [0, 1]
 */
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/**
 * Split destination name into segments, where text wrapped in braces takes the given accent colour, & all other
 * text the default label colour.
 *
 * @param name name of destination, eg. "ls {garden}"
 * @param accent accent colour
 * @returns non-empty segments of name, without braces
 */
const parseLabel = (name: string, accent: RGB): Segment[] => {
    if (!/^[^{}]*(\{[^{}]*\}[^{}]*)*$/.test(name)) throw new Error(`Unbalanced braces in destination name "${name}"`);
    return name.split(/[{}]/)
        .map((text, i) => ({ color: i % 2 === 1 ? accent : LABEL_COLOR, text }))
        .filter(({ text }) => text.length > 0);
};

export default class QRMenu {
    private hovered?: number; // index of hovered destination
    private pointed?: number; // index of destination under pointer, which is hovered unless one is selected
    private hover: number[]; // animated hover intensity of each destination, in [0, 1]

    // selected destination slides to top of QR code (& its label with it), while the rest fade out; while selected,
    // hovered destination stays fixed
    private selected?: number; // index of selected destination, kept until selection animation has fully reversed
    private selecting = false; // whether selection animation plays forwards (or has finished), rather than reversing
    private selectProgress = 0; // linear progress of selection animation, in [0, 1]

    // label shown below QR code after prompt, typed & erased one character at a time
    private labels: Segment[][]; // label of each destination
    private label?: number; // index of destination whose label is shown (or undefined if none)
    private labelChars = 0; // number of characters of label revealed (fractional, for animation)
    private shownKey = ""; // key identifying text currently written to text renderer
    private text?: TextRenderer;

    constructor(
        private canvas: HTMLCanvasElement,
        private qr: QRRenderer,
        destinations: Destination[],
    ) {
        this.hover = destinations.map(() => 0);
        this.labels = destinations.map(({ color, name }) =>
            parseLabel(name, parseHex(color).map(c => Math.min(1, c / 255 * ACCENT_BOOST)) as RGB)
        );

        // pointerdown makes taps work on touch screens, which have no hover; since touch pointers also 'leave' as
        // soon as the finger lifts, a tapped destination instead stays hovered until the next tap
        canvas.addEventListener("pointermove", e => { this.pointAt(this.regionAt(e)); });
        canvas.addEventListener("pointerdown", e => { this.press(e); });
        canvas.addEventListener("pointerleave", e => { if (e.pointerType !== "touch") this.pointAt(undefined); });
        window.addEventListener("keydown", e => { if (e.key === "Escape") this.selecting = false; });
    }

    /**
     * Find destination under pointer, if any. Pointer position is mapped through the curved-monitor warp, so that
     * it lines up with what is displayed.
     *
     * @param event pointer event
     * @returns index of destination (or undefined if none)
     */
    private regionAt({ clientX, clientY }: PointerEvent): number | undefined {
        const rect = this.canvas.getBoundingClientRect();
        const uv: Pos = [(clientX - rect.left) / rect.width, 1 - (clientY - rect.top) / rect.height];
        return this.qr.regionAt(warpUV(uv));
    }

    /**
     * Point at given destination, hovering it unless a destination is selected.
     *
     * @param index index of destination (or undefined if none)
     */
    private pointAt(index?: number): void {
        this.pointed = index;
        if (this.selected === undefined) this.hovered = index;
        this.canvas.style.cursor = index === undefined ? "" : "pointer";
    }

    /**
     * Select destination under pointer: on click, or on touch screens, on tapping an already-hovered destination.
     * Pressing anywhere but the selected destination reverses its selection.
     *
     * @param event pointer event
     */
    private press(event: PointerEvent): void {
        const [previous, index] = [this.hovered, this.regionAt(event)];
        this.pointAt(index);
        if (this.selected !== undefined) {
            this.selecting = index === this.selected; // only selected destination can be found while selected
            return;
        }

        if (index !== undefined && (event.pointerType !== "touch" || index === previous)) {
            [this.selected, this.selecting] = [index, true];
        }
    }

    /**
     * Set text renderer used to show labels (which may only become available once its font has loaded).
     *
     * @param text text renderer
     */
    public setTextRenderer(text: TextRenderer): void {
        this.text = text;
    }

    /**
     * Get length of longest line shown below QR code, ie. longest label with prompt & cursor.
     *
     * @returns length of longest line, in characters
     */
    public maxLineLength(): number {
        return PROMPT.length + Math.max(0, ...this.labels.map(labelLength)) + 1;
    }

    /**
     * Position label below QR code (or once selected, below selected destination at the end of its slide to the top
     * of the QR code), left-aligned with QR code & wrapping at its right edge.
     */
    private layout(): void {
        const [left, top, right, bottom] = this.qr.contentRect();
        const rect = this.selected === undefined ? undefined : this.qr.regionRect(this.selected);
        const end = rect ? top + rect[3] - rect[1] : bottom;
        const labelTop = Math.round(bottom + (end - bottom) * smoothstep(this.selectProgress));
        this.text?.setBounds([left, labelTop + LABEL_GAP * this.qr.getModuleSize(), right, Infinity]);
    }

    /**
     * Get label currently shown below QR code.
     *
     * @returns segments of label (empty if none is shown)
     */
    private shownLabel(): Segment[] {
        return this.label === undefined ? [] : this.labels[this.label] ?? [];
    }

    /**
     * Advance hover & label animations.
     *
     * @param dt time (in seconds) since last update
     * @param time current time (in seconds)
     */
    public update(dt: number, time: number): void {
        // ease hover intensities towards 1 for hovered destination, & 0 for others
        const ease = 1 - Math.exp(-dt / HOVER_TIME);
        this.hover = this.hover.map((h, i) => h + ((i === this.hovered ? 1 : 0) - h) * ease);
        this.qr.setHover(this.hover);

        // advance selection animation, forgetting selected destination once fully reversed
        const step = (this.selecting ? dt : -dt) / SELECT_TIME;
        this.selectProgress = Math.max(0, Math.min(1, this.selectProgress + step));
        if (this.selected !== undefined && !this.selecting && this.selectProgress === 0) {
            [this.selected, this.hovered] = [undefined, this.pointed];
        }
        this.qr.setSelection(this.selected, smoothstep(this.selectProgress));
        this.layout();

        // erase previous label before typing new one
        if (this.label !== this.hovered) {
            this.labelChars -= ERASE_RATE * dt;
            if (this.labelChars <= 0) [this.label, this.labelChars] = [this.hovered, 0];
        } else {
            this.labelChars = Math.min(labelLength(this.shownLabel()), this.labelChars + TYPE_RATE * dt);
        }

        // rewrite text only when it changes, to avoid needless buffer uploads
        const chars = Math.floor(this.labelChars);
        const cursor = Math.floor(time / CURSOR_BLINK) % 2 === 0 ? "█" : "";
        const shownKey = `${String(this.label)}:${chars.toFixed()}:${cursor}`;
        if (!this.text || shownKey === this.shownKey) return;

        // print revealed characters of each segment in its colour, between prompt & cursor
        this.text.clear();
        this.text.print(PROMPT, LABEL_COLOR);
        let remaining = chars;
        for (const { text, color } of this.shownLabel()) {
            this.text.print(text.slice(0, remaining), color);
            remaining = Math.max(0, remaining - text.length);
        }
        this.text.print(cursor, LABEL_COLOR);
        this.shownKey = shownKey;
    }
}
