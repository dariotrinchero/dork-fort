import type { Dimensions, Pos, RGB, RGBA } from "types/global";
import type { QRData } from "types/qrRenderer";
import type { RenderPass } from "types/renderPipeline";

import { createProgram, createQuadBuffer, createTexture, createVertexArray } from "webglHelpers";

// shader source code
import qrFrag from "shaders/qr.frag";
import screenVert from "shaders/screen.vert";

const QR_FILL = 0.8; // maximum fraction of shorter side of output covered by QR code

/**
 * Parse hex colour string (without leading '#') into RGB components.
 *
 * @param hex hex colour string, eg. "1f9a94"
 * @returns red, green, & blue components, each in [0, 255]
 */
const parseHex = (hex: string): RGB => [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
];

export default class QRRenderer {
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private texture: WebGLTexture;

    // layout of QR code on output, in pixels
    private moduleSize = 1;
    private origin: Pos = [0, 0];

    constructor(
        private gl: WebGL2RenderingContext,
        private data: QRData,
        private resolution: Dimensions,
        bgBrightness = 1, // multiplier for background colour from SVG (0 for black)
    ) {
        this.texture = QRRenderer.createModuleTexture(gl, data, bgBrightness);
        this.program = createProgram(gl, screenVert, qrFrag);
        this.vao = createVertexArray(gl, this.program, { aQuadVertPos: { buffer: createQuadBuffer(gl), itemSize: 2 } });
        this.resize(resolution);
    }

    /**
     * Create texture with one texel per module (including quiet zone) giving its colour, & storing 1 + index of
     * its group in the alpha channel (0 for background modules).
     *
     * @param gl WebGL rendering context
     * @param data module data of QR code
     * @param bgBrightness multiplier for background colour from QR code data (0 for black)
     * @returns texture of QR code modules
     */
    private static createModuleTexture(
        gl: WebGL2RenderingContext,
        { background, modules, size }: QRData,
        bgBrightness: number
    ): WebGLTexture {
        const texels = new Map(modules.map(([x, y, color, group]) => [y * size + x, [...parseHex(color), group + 1] as const]));
        const bgTexel = [...parseHex(background).map(c => Math.round(c * bgBrightness)), 0] as RGBA;
        return createTexture(gl, {
            colorFn: ([x, y]) => [...texels.get(y * size + x) ?? bgTexel],
            dims: [size, size],
        }, gl.NEAREST);
    }

    /**
     * Fit QR code to given output resolution, centred, with each module a whole number of pixels wide.
     *
     * @param resolution resolution (in pixels) of output
     */
    public resize(resolution: Dimensions): void {
        const { size } = this.data;
        this.resolution = resolution;
        this.moduleSize = Math.max(1, Math.floor(QR_FILL * Math.min(...resolution) / size));
        this.origin = [
            Math.floor((resolution[0] - size * this.moduleSize) / 2),
            Math.floor((resolution[1] - size * this.moduleSize) / 2),
        ];
    }

    /**
     * Get render pass drawing QR code over whole output (with background colour beyond quiet zone).
     *
     * @returns render pass drawing QR code
     */
    public renderPass(): RenderPass {
        return {
            composition: { ignoreInput: true, mode: "parallel" },
            program: this.program,
            uniforms: {
                uModuleSize: { type: "1f", value: this.moduleSize },
                uOrigin: { type: "2f", value: this.origin },
                uQR: { type: "tex", value: this.texture },
                uResolution: { type: "2f", value: this.resolution },
            },
            vao: this.vao,
        };
    }
}
