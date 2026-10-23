import type { Pos, RGB } from "types/global";
import type { Destination } from "types/destinations";

import type QRRenderer from "qrRenderer";
import type TextRenderer from "textRenderer";

import { parseHex } from "qrRenderer";
import { warpUV } from "warp";

const HOVER_TIME = 0.15; // time constant (in seconds) of hover fade in & out
const TYPE_RATE = 60; // characters of label typed per second
const ERASE_RATE = 120; // characters of label erased per second
const CURSOR_BLINK = 0.5; // time (in seconds) for which cursor is alternately shown & hidden
const LABEL_COLOR: RGB = [0.92, 0.9, 0.85];
const ACCENT_BOOST = 1.5; // brightness multiplier for accent colours, to match hovered region (see BOOST in qr.frag)
const PROMPT = ">> "; // prompt always shown before label
const LABEL_GAP = 2; // gap (in QR code modules) between QR code & label

// run of label text in a single colour
interface Segment {
    text: string;
    color: RGB;
}

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
    private hover: number[]; // animated hover intensity of each destination, in [0, 1]

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
        this.labels = destinations.map(({ color, name }, i) => {
            const accent = color === undefined ? qr.regionColor(i) : parseHex(color).map(c => c / 255);
            return parseLabel(name, accent.map(c => Math.min(1, c * ACCENT_BOOST)) as RGB);
        });

        // pointerdown makes taps work on touch screens, which have no hover; since touch pointers also 'leave' as
        // soon as the finger lifts, a tapped destination instead stays hovered until the next tap
        canvas.addEventListener("pointermove", e => { this.pointAt(e); });
        canvas.addEventListener("pointerdown", e => { this.pointAt(e); });
        canvas.addEventListener("pointerleave", e => { if (e.pointerType !== "touch") this.setHovered(undefined); });
    }

    /**
     * Hover destination under pointer, if any. Pointer position is mapped through the curved-monitor warp, so
     * that it lines up with what is displayed.
     *
     * @param event pointer event
     */
    private pointAt({ clientX, clientY }: PointerEvent): void {
        const rect = this.canvas.getBoundingClientRect();
        const uv: Pos = [(clientX - rect.left) / rect.width, 1 - (clientY - rect.top) / rect.height];
        this.setHovered(this.qr.regionAt(warpUV(uv)));
    }

    /**
     * Set hovered destination.
     *
     * @param index index of destination (or undefined if none)
     */
    private setHovered(index?: number): void {
        this.hovered = index;
        this.canvas.style.cursor = index === undefined ? "" : "pointer";
    }

    /**
     * Set text renderer used to show labels (which may only become available once its font has loaded).
     *
     * @param text text renderer
     */
    public setTextRenderer(text: TextRenderer): void {
        this.text = text;
        this.layout();
    }

    /**
     * Position label below QR code, left-aligned with it; call whenever QR code or text renderer is resized.
     */
    public layout(): void {
        const [left, , , bottom] = this.qr.contentRect();
        this.text?.setOrigin([left, bottom + LABEL_GAP * this.qr.getModuleSize()]);
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

        // erase previous label before typing new one
        if (this.label !== this.hovered) {
            this.labelChars -= ERASE_RATE * dt;
            if (this.labelChars <= 0) [this.label, this.labelChars] = [this.hovered, 0];
        } else {
            const length = (this.labels[this.label ?? -1] ?? []).reduce((sum, { text }) => sum + text.length, 0);
            this.labelChars = Math.min(length, this.labelChars + TYPE_RATE * dt);
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
        for (const { text, color } of this.labels[this.label ?? -1] ?? []) {
            this.text.print(text.slice(0, remaining), color);
            remaining = Math.max(0, remaining - text.length);
        }
        this.text.print(cursor, LABEL_COLOR);
        this.shownKey = shownKey;
    }
}
