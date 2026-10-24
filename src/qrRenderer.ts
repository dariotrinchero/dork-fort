import type { Dimensions, Pos, RGBA, Rect } from "types/global";
import type { QRData, QRRendererOptions } from "types/qrRenderer";
import type { RenderPass } from "types/renderPipeline";

import { createProgram, createQuadBuffer, createTexture, createVertexArray } from "webglHelpers";
import { parseHex } from "palette";

// shader source code
import qrFrag from "shaders/qr.frag";
import screenVert from "shaders/screen.vert";

const QR_FILL = 0.8; // maximum fraction of shorter side of output covered by QR code
const MAX_REGIONS = 8; // must match qr.frag
const HIT_PADDING = 1; // padding (in modules) around hit boxes

type Bounds = Rect; // left, top, right, & bottom (exclusive), in modules

interface HitBox {
    region: number; // index of region
    bounds: Bounds;
}

/**
 * Get bounding box of given modules.
 *
 * @param cells module coordinates
 * @returns left, top, right, & bottom (exclusive) of bounding box, in modules
 */
const boundingBox = (cells: Pos[]): Bounds => [
    Math.min(...cells.map(([x]) => x)),
    Math.min(...cells.map(([, y]) => y)),
    Math.max(...cells.map(([x]) => x)) + 1,
    Math.max(...cells.map(([, y]) => y)) + 1,
];

export default class QRRenderer {
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private texture: WebGLTexture;

    // layout of QR code on output, in pixels
    private moduleSize = 1;
    private origin: Pos = [0, 0];

    // interactive regions: region at each module position (-1 if none), & hover intensities
    private cellRegions: Int8Array;
    private hover = new Float32Array(MAX_REGIONS);
    private focus = 0;

    // selected region (-1 if none), fade of other modules, & vertical offset (in pixels) of selected region
    private selected = -1;
    private dismiss = 0;
    private slide = 0;

    // bounding box of all coloured modules (ie. QR code without quiet zone), & of each region's modules, in modules
    private contentBounds: Bounds;
    private regionBounds: (Bounds | undefined)[];

    constructor(
        private gl: WebGL2RenderingContext,
        private data: QRData,
        private resolution: Dimensions,
        { bgBrightness = 1, regions = [] }: QRRendererOptions = {},
    ) {
        if (regions.length > MAX_REGIONS) throw new Error(`QR code supports at most ${MAX_REGIONS.toFixed()} regions`);

        // assign each group of modules to the first region whose label path prefix matches
        const groupRegions = data.groups.map(path => {
            const label = path.join("/");
            return regions.findIndex(prefix => label === prefix || label.startsWith(`${prefix}/`));
        });

        this.cellRegions = QRRenderer.resolveCellRegions(data, groupRegions);
        this.contentBounds = boundingBox(data.modules.map(([x, y]): Pos => [x, y]));
        this.regionBounds = regions.map((_, region) => {
            const cells = data.modules.filter(m => groupRegions[m[3]] === region).map(([x, y]): Pos => [x, y]);
            return cells.length > 0 ? boundingBox(cells) : undefined;
        });

        this.texture = QRRenderer.createModuleTexture(gl, data, groupRegions, bgBrightness);
        this.program = createProgram(gl, screenVert, qrFrag);
        this.vao = createVertexArray(gl, this.program, { aQuadVertPos: { buffer: createQuadBuffer(gl), itemSize: 2 } });
        this.resize(resolution);
    }

    /**
     * Determine region at each module position. A region's own modules belong to it; other positions within
     * (padded) hit boxes go to the region with the nearest module, so that overlapping boxes are split along the
     * outlines of their shapes. Each group gets its own hit box, since a region's groups may lie far apart (eg.
     * QR code alignment boxes).
     *
     * @param data module data of QR code
     * @param groupRegions index of region containing each group (-1 if none)
     * @returns region at each module position (y * size + x), or -1 if none
     */
    private static resolveCellRegions({ modules, size }: QRData, groupRegions: number[]): Int8Array {
        const cellRegions = new Int8Array(size * size).fill(-1);
        const regionModules = new Map<number, Pos[]>();
        modules.forEach(([x, y, , group]) => {
            const region = groupRegions[group] ?? -1;
            cellRegions[y * size + x] = region;
            if (region === -1) return;
            const cells = regionModules.get(region);
            if (cells) cells.push([x, y]);
            else regionModules.set(region, [[x, y]]);
        });

        const hitBoxes: HitBox[] = [];
        groupRegions.forEach((region, group) => {
            if (region === -1) return;
            hitBoxes.push({ bounds: boundingBox(modules.filter(m => m[3] === group).map(([x, y]): Pos => [x, y])), region });
        });

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (cellRegions[y * size + x] !== -1) continue; // own module

                let bestDist = Infinity;
                hitBoxes.forEach(({ bounds: [l, t, r, b], region }) => {
                    if (x < l - HIT_PADDING || x >= r + HIT_PADDING || y < t - HIT_PADDING || y >= b + HIT_PADDING) return;
                    const dist = Math.min(...(regionModules.get(region) ?? []).map(([mx, my]) => Math.hypot(mx - x, my - y)));
                    if (dist < bestDist) [bestDist, cellRegions[y * size + x]] = [dist, region];
                });
            }
        }
        return cellRegions;
    }

    /**
     * Create texture with one texel per module (including quiet zone) giving its colour, with a tag in the alpha
     * channel: 0 for background, 1 for modules in no region, & k + 2 for modules in region k.
     *
     * @param gl WebGL rendering context
     * @param data module data of QR code
     * @param groupRegions index of region containing each group (-1 if none)
     * @param bgBrightness multiplier for background colour from QR code data (0 for black)
     * @returns texture of QR code modules
     */
    private static createModuleTexture(
        gl: WebGL2RenderingContext,
        { background, modules, size }: QRData,
        groupRegions: number[],
        bgBrightness: number
    ): WebGLTexture {
        const texels = new Map(modules.map(([x, y, color, group]) =>
            [y * size + x, [...parseHex(color), (groupRegions[group] ?? -1) + 2] as const]
        ));
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
     * Get width & height of each module, in pixels.
     *
     * @returns module size in pixels
     */
    public getModuleSize(): number {
        return this.moduleSize;
    }

    /**
     * Convert bounds in modules to bounds on output.
     *
     * @param bounds left, top, right, & bottom, in modules
     * @returns left, top, right, & bottom, in pixels from top-left of output
     */
    private toPixels([left, top, right, bottom]: Bounds): Rect {
        const toPixels = (cells: number, axis: 0 | 1): number => this.origin[axis] + cells * this.moduleSize;
        return [toPixels(left, 0), toPixels(top, 1), toPixels(right, 0), toPixels(bottom, 1)];
    }

    /**
     * Get bounds of QR code (excluding quiet zone) on output.
     *
     * @returns left, top, right, & bottom of QR code, in pixels from top-left of output
     */
    public contentRect(): Rect {
        return this.toPixels(this.contentBounds);
    }

    /**
     * Get bounds of given region's modules on output, ignoring any slide of selected region.
     *
     * @param region index of region
     * @returns left, top, right, & bottom of region, in pixels from top-left of output (or undefined if empty)
     */
    public regionRect(region: number): Rect | undefined {
        const bounds = this.regionBounds[region];
        return bounds && this.toPixels(bounds);
    }

    /**
     * Find region at given position (see resolveCellRegions()). While a region is selected, only it can be found,
     * at its slid position.
     *
     * @param uv UV coordinates on output (with v = 0 at the bottom)
     * @returns index of region at given position (or undefined if none)
     */
    public regionAt([u, v]: Pos): number | undefined {
        const { size } = this.data;
        const x = (u * this.resolution[0] - this.origin[0]) / this.moduleSize;
        const y = ((1 - v) * this.resolution[1] - this.origin[1] - this.slide) / this.moduleSize;
        if (x < 0 || y < 0 || x >= size || y >= size) return undefined;

        const region = this.cellRegions[Math.floor(y) * size + Math.floor(x)] ?? -1;
        return region === -1 || (this.selected !== -1 && region !== this.selected) ? undefined : region;
    }

    /**
     * Set hover intensity of each region.
     *
     * @param values hover intensity of each region, in [0, 1]
     */
    public setHover(values: number[]): void {
        this.hover.fill(0);
        this.hover.set(values.slice(0, MAX_REGIONS));
        this.focus = Math.max(0, ...values);
    }

    /**
     * Set selected region, which slides up until its top lines up with that of the QR code, while all other modules
     * fade into the background.
     *
     * @param region index of region (or undefined if none)
     * @param progress progress of selection animation, in [0, 1]
     */
    public setSelection(region: number | undefined, progress: number): void {
        const rect = region === undefined ? undefined : this.regionRect(region);
        [this.selected, this.dismiss, this.slide] = region !== undefined && rect
            ? [region, progress, Math.round(progress * (this.contentRect()[1] - rect[1]))]
            : [-1, 0, 0];
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
                uDismiss: { type: "1f", value: this.dismiss },
                uFocus: { type: "1f", value: this.focus },
                uHover: { type: "1fv", value: this.hover },
                uModuleSize: { type: "1f", value: this.moduleSize },
                uOrigin: { type: "2f", value: this.origin },
                uQR: { type: "tex", value: this.texture },
                uResolution: { type: "2f", value: this.resolution },
                uSelected: { type: "1f", value: this.selected },
                uSlide: { type: "1f", value: this.slide },
            },
            vao: this.vao,
        };
    }
}
