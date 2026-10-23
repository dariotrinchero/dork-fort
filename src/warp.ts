import type { Pos } from "types/global";
import type { Uniforms } from "types/renderPipeline";

// parameters of curved-monitor warp, shared by warp shader & pointer hit-testing
const RADIUS = 0.5;
const MAGNITUDE = 0.05;
const CUTOFF = 0.3;

/**
 * Map UV coordinates on screen to UV coordinates of the content displayed there, mirroring curvedMonitor() in
 * warp.frag.
 * 
 * @param uv UV coordinates on screen
 * @returns UV coordinates in content (outside [0, 1] if nothing is displayed there)
 */
export const warpUV = ([u, v]: Pos): Pos => {
    const [x, y] = [u - 0.5, v - 0.5];
    const t = Math.hypot(x, y) / RADIUS;
    const scale = (1 / CUTOFF - MAGNITUDE + MAGNITUDE * t ** 4) * CUTOFF;
    return [x * scale + 0.5, y * scale + 0.5];
};

/**
 * Get uniforms setting parameters of warp shader.
 * 
 * @returns uniforms needed by warp shader
 */
export const warpUniforms = (): Uniforms => ({
    uCutoff: { type: "1f", value: CUTOFF },
    uMagnitude: { type: "1f", value: MAGNITUDE },
    uRadius: { type: "1f", value: RADIUS },
});
