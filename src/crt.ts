import type { RGB } from "types/global";
import type { Uniforms } from "types/renderPipeline";

import { setWarp } from "warp";

interface ScreenMode {
    crt: boolean;   // whether CRT effects (incl. curved-monitor warp) are applied
    phosphor?: RGB; // phosphor colour of monochrome screen (colour screen if omitted)
}

// screen modes: CRT effects on (in colour) or off, & hidden monochrome modes (P3 amber, P1 green, & P4 white)
export const SCREEN_MODES = new Map<string, ScreenMode>([
    ["on", { crt: true }],
    ["off", { crt: false }],
    ["amber", { crt: true, phosphor: [1, 0.69, 0] }],
    ["green", { crt: true, phosphor: [0.2, 1, 0.2] }],
    ["white", { crt: true, phosphor: [0.9, 0.93, 1] }],
]);

let mode: ScreenMode = { crt: true };

/**
 * Set screen mode of CRT shader (& warp).
 *
 * @param name name of screen mode (see SCREEN_MODES)
 * @returns whether screen mode exists
 */
export const setScreenMode = (name: string): boolean => {
    const newMode = SCREEN_MODES.get(name);
    if (!newMode) return false;
    mode = newMode;
    setWarp(mode.crt);
    return true;
};

/**
 * Get uniforms setting screen mode of CRT shader.
 *
 * @returns uniforms needed by CRT shader, besides those depending on output
 */
export const crtUniforms = (): Uniforms => ({
    uCRT: { type: "1f", value: mode.crt ? 1 : 0 },
    uMono: { type: "1f", value: mode.phosphor ? 1 : 0 },
    uPhosphor: { type: "3f", value: mode.phosphor ?? [1, 1, 1] },
});
