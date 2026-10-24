import type { RGB } from "types/global";

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
