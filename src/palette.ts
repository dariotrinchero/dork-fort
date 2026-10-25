import type { RGB } from "types/global";

const ACCENT_BOOST = 1.5; // brightness multiplier for accent colours, to match hovered region (see BOOST in qr.frag)

/**
 * Parse hex colour string (without leading '#') into RGB components.
 *
 * @param hex hex colour string, eg. "1f9a94"
 * @returns red, green, & blue components, each in [0, 255]
 */
export const parseHex = (hex: string): RGB => [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
];

/**
 * Scale brightness of colour, clamping components to 1.
 *
 * @param color colour, with components in [0, 1]
 * @param factor brightness multiplier
 * @returns scaled colour
 */
const scale = (color: RGB, factor: number): RGB => color.map(c => Math.min(1, c * factor)) as RGB;

/**
 * Get accent colour of destination, as shown in text.
 *
 * @param hex accent colour (hex, without leading '#'), as given in destinations.ts
 * @returns accent colour, with components in [0, 1]
 */
export const accent = (hex: string): RGB => scale(parseHex(hex).map(c => c / 255) as RGB, ACCENT_BOOST);

// text colours, with components in [0, 1]; accent colours are reserved for text naming destinations
export const FG: RGB = [0.85, 0.81, 0.71];    // default, eg. known commands
export const DIM = scale(FG, 0.6);            // secondary, eg. arguments
export const GHOST = scale(FG, 0.35);         // suggested but not typed, eg. completions & hints
export const ERROR: RGB = [0.86, 0.26, 0.26]; // unknown commands & error messages
export const INVERSE: RGB = [0.05, 0.05, 0.05]; // text in inverse video, on accent colour (eg. hovered links)
