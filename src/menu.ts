import type { Pos } from "types/global";
import type { TextLayout } from "types/menu";

import type QRRenderer from "qrRenderer";

import { warpUV } from "warp";

const HOVER_TIME = 0.15; // time constant (in seconds) of hover fade in & out
const TEXT_GAP = 2; // gap (in QR code modules) above text below QR code, & below shown destination
const SHOW_TIME = 0.25; // duration (in seconds) of animation showing output, & of its reversal

/**
 * Ease in & out of animation.
 *
 * @param t linear progress of animation, in [0, 1]
 * @returns eased progress of animation, in [0, 1]
 */
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export default class QRMenu {
    // called on choosing destination (by clicking it, or on touch screens, tapping it once hovered), & on pressing
    // elsewhere while output is shown
    public onChoose?: (index: number) => void;
    public onDismiss?: () => void;
    public claimPress?: (event: PointerEvent) => boolean; // given first refusal of presses (eg. on clickable text)

    private pointed?: number; // index of destination under pointer
    private typed?: number | null = null; // index of destination named by command being typed (null if not typing)
    private hover: number[]; // animated hover intensity of each destination, in [0, 1]

    // while output is shown, the destination shown slides to top of QR code (& text below it with it), while the
    // rest fade out; for commands other than destinations, the whole QR code fades partially
    private shown?: number | null; // index of destination shown (null if none), kept until animation fully reverses
    private showing = false; // whether animation plays forwards (or has finished), rather than reversing
    private showProgress = 0; // linear progress of animation, in [0, 1]

    constructor(
        private canvas: HTMLCanvasElement,
        private qr: QRRenderer,
        destinations: number,
    ) {
        this.hover = Array.from({ length: destinations }, () => 0);

        // pointerdown makes taps work on touch screens, which have no hover; since touch pointers also 'leave' as
        // soon as the finger lifts, a tapped destination instead stays hovered until the next tap
        canvas.addEventListener("pointermove", e => { this.pointAt(this.regionAt(e)); });
        canvas.addEventListener("pointerdown", e => { this.press(e); });
        canvas.addEventListener("pointerleave", e => { if (e.pointerType !== "touch") this.pointAt(undefined); });
    }

    /**
     * Get UV coordinates of pointer on output, mapped through the curved-monitor warp, so that they line up with
     * what is displayed.
     *
     * @param event pointer event
     * @returns UV coordinates on output (with v = 0 at the bottom)
     */
    private pointerUV({ clientX, clientY }: PointerEvent): Pos {
        const rect = this.canvas.getBoundingClientRect();
        return warpUV([(clientX - rect.left) / rect.width, 1 - (clientY - rect.top) / rect.height]);
    }

    /**
     * Find destination under pointer, if any; none can be found while QR code is faded behind output of commands
     * other than destinations.
     *
     * @param event pointer event
     * @returns index of destination (or undefined if none)
     */
    private regionAt(event: PointerEvent): number | undefined {
        return this.shown === null ? undefined : this.qr.regionAt(this.pointerUV(event));
    }

    /**
     * Check whether pointer lies below QR code, where the prompt is.
     *
     * @param event pointer event
     * @returns whether pointer is below QR code
     */
    public isBelowQR(event: PointerEvent): boolean {
        return this.pointerPixel(event)[1] >= this.qr.contentRect()[3];
    }

    /**
     * Get position of pointer on output, mapped through the curved-monitor warp.
     *
     * @param event pointer event
     * @returns position, in pixels from top-left of output
     */
    public pointerPixel(event: PointerEvent): Pos {
        return this.qr.pixelAt(this.pointerUV(event));
    }

    /**
     * Point at given destination.
     *
     * @param index index of destination (or undefined if none)
     */
    private pointAt(index?: number): void {
        this.pointed = index;
        this.canvas.style.cursor = index === undefined ? "" : "pointer";
    }

    /**
     * Choose destination under pointer: on click, or on touch screens, on tapping an already-hovered destination.
     * While output is shown, pressing anywhere but the destination shown dismisses it. Presses below the QR code
     * are left to the prompt.
     *
     * @param event pointer event
     */
    private press(event: PointerEvent): void {
        if (this.isBelowQR(event) || this.claimPress?.(event)) return;
        const [previous, index] = [this.hovered(), this.regionAt(event)];
        this.pointAt(index);
        if (typeof this.shown === "number") {
            if (index === undefined) this.onDismiss?.(); // only destination shown can be found while shown
            return;
        }

        if (index !== undefined && (event.pointerType !== "touch" || index === previous)) this.onChoose?.(index);
        else if (index === undefined && this.shown === null) this.onDismiss?.();
    }

    /**
     * Get hovered destination: the one shown (if any), else the one named by the command being typed, else the
     * one under the pointer.
     *
     * @returns index of hovered destination (or undefined if none)
     */
    public hovered(): number | undefined {
        return this.shown ?? (this.typed === null ? this.pointed : this.typed);
    }

    /**
     * Highlight destination named by command being typed, in place of destination under pointer.
     *
     * @param index index of destination (undefined if none), or null to highlight destination under pointer
     */
    public highlight(index: number | null | undefined): void {
        this.typed = index;
    }

    /**
     * Show output, sliding given destination to top of QR code (or if none is given, fading QR code partially).
     *
     * @param index index of destination (or undefined if none)
     */
    public open(index?: number): void {
        [this.shown, this.showing] = [index ?? null, true];
        if (index === undefined) this.pointAt(undefined); // pointer finds nothing on faded QR code (see regionAt())
    }

    /**
     * Hide output, reversing animation.
     */
    public close(): void {
        this.showing = false;
    }

    /**
     * Check whether output is shown, including while its animation reverses.
     *
     * @returns whether output is shown
     */
    public isOpen(): boolean {
        return this.shown !== undefined;
    }

    /**
     * Get layout of text around QR code, following animation showing output.
     *
     * @returns layout of text
     */
    public textLayout(): TextLayout {
        const [left, top, right, bottom] = this.qr.contentRect();
        const gap = TEXT_GAP * this.qr.getModuleSize();
        const shown = typeof this.shown === "number" ? this.shown : undefined;
        const rect = shown === undefined ? undefined : this.qr.iconRect(shown);
        const promptTop = bottom + gap;
        const end = rect ? Math.min(top + rect[3] - rect[1] + gap, (top + bottom) / 2) : top; // not below middle of QR
        const progress = smoothstep(this.showProgress);
        const echoTop = Math.round(promptTop + (end - promptTop) * progress);

        // space beside icon slides with it (see QRRenderer.setSelection())
        const aside = shown === undefined ? undefined : this.qr.asideRect(shown);
        const slide = rect ? Math.round(progress * (top - rect[1])) : 0;
        return {
            aside: aside && [aside[0], aside[1] + slide, aside[2], aside[3] + slide],
            echoTop, left, paneBottom: bottom, promptTop, right,
        };
    }

    /**
     * Advance hover & output animations.
     *
     * @param dt time (in seconds) since last update
     */
    public update(dt: number): void {
        // ease hover intensities towards 1 for hovered destination, & 0 for others
        const ease = 1 - Math.exp(-dt / HOVER_TIME);
        const hovered = this.hovered();
        this.hover = this.hover.map((h, i) => h + ((i === hovered ? 1 : 0) - h) * ease);
        this.qr.setHover(this.hover);

        // advance animation, forgetting destination shown once fully reversed
        const step = (this.showing ? dt : -dt) / SHOW_TIME;
        this.showProgress = Math.max(0, Math.min(1, this.showProgress + step));
        if (!this.showing && this.showProgress === 0) this.shown = undefined;
        this.qr.setSelection(this.shown ?? undefined, smoothstep(this.showProgress));
    }
}
