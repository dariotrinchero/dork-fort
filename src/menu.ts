import type { Pos, RGB } from "types/global";
import type { Destination } from "types/destinations";

import type QRRenderer from "qrRenderer";
import type TextRenderer from "textRenderer";

import { warpUV } from "warp";

const HOVER_TIME = 0.12; // time constant (in seconds) of hover fade in & out
const TYPE_RATE = 60; // characters of label typed per second
const ERASE_RATE = 120; // characters of label erased per second
const CURSOR_BLINK = 0.5; // time (in seconds) for which cursor is alternately shown & hidden
const LABEL_COLOR: RGB = [0.92, 0.9, 0.85];

export default class QRMenu {
    private hovered?: number; // index of hovered destination
    private hover: number[]; // animated hover intensity of each destination, in [0, 1]

    // label shown below QR code, typed & erased one character at a time
    private label = "";
    private labelChars = 0; // number of characters of label revealed (fractional, for animation)
    private shownText = ""; // text currently written to text renderer
    private text?: TextRenderer;

    constructor(
        private canvas: HTMLCanvasElement,
        private qr: QRRenderer,
        private destinations: Destination[],
    ) {
        this.hover = destinations.map(() => 0);

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
        this.text?.setOrigin([left, bottom + this.qr.getModuleSize()]);
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
        const name = this.hovered === undefined ? undefined : this.destinations[this.hovered]?.name;
        const target = name === undefined ? "" : `>> GOTO ${name}`;
        if (this.label !== target) {
            this.labelChars -= ERASE_RATE * dt;
            if (this.labelChars <= 0) [this.label, this.labelChars] = [target, 0];
        } else this.labelChars = Math.min(this.label.length, this.labelChars + TYPE_RATE * dt);

        // rewrite text only when it changes, to avoid needless buffer uploads
        const cursor = this.hovered !== undefined && Math.floor(time / CURSOR_BLINK) % 2 === 0 ? "█" : "";
        const shownText = this.label.slice(0, Math.floor(this.labelChars)) + cursor;
        if (!this.text || shownText === this.shownText) return;

        this.text.clear();
        this.text.print(shownText, LABEL_COLOR);
        this.shownText = shownText;
    }
}
