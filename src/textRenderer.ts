import type { Dimensions, Pos, RGB, Rect } from "types/global";
import type { TextRendererSize, TextRendererSizeSpec } from "types/textRenderer";
import type { RenderPass } from "types/renderPipeline";

import { createProgram, createQuadBuffer, createTexture, createVertexArray } from "webglHelpers";

// shader source code
import textFrag from "shaders/text.frag";
import textVert from "shaders/text.vert";

import glyphs from "assets/glyphs.json";

// glyphs (& inclusive ranges of Unicode code points) available to text, shared with build script, which subsets
// font to these glyphs
type GlyphSet = (string | [number, number])[];
const GLYPHS = glyphs as GlyphSet;

const SCREEN_PADDING = 10; // minimum padding (in pixels) around text grid

interface FontAtlas {
    atlas: WebGLTexture;       // texture with grid of pre-rendered characters
    charMap: Map<string, Pos>; // map from character to pixel location on atlas
    atlasDims: Dimensions;     // dimensions of atlas
}

interface CharTile {
    ch: string;
    color: RGB;
}

export default class TextRenderer {
    private textGrid: Map<string, CharTile> = new Map<string, CharTile>();
    private cursorPos: Pos = [0, 0];
    private staleBuffers = true;
    private instanceCount = 0; // number of character tiles within text grid
    private bounds?: Rect; // region (in pixels) to which text grid is fitted, if not centred on whole output

    // portion of text grid in use, fitted to bounds (see fitBounds()), & position (in pixels) of its top-left corner
    private gridDims: Dimensions = [0, 0];
    private origin: Pos = [0, 0];

    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private fontAtlas: FontAtlas;

    private static measureCtx: CanvasRenderingContext2D | null = null; // shared context for measuring text

    // buffers & their data arrays (data arrays are sized to fit full text grid; see allocateBuffers())
    private screenPosData!: Float32Array;
    private atlasPosData!: Float32Array;
    private colorData!: Float32Array;
    private screenPosBuf: WebGLBuffer;
    private atlasPosBuf: WebGLBuffer;
    private colorBuf: WebGLBuffer;

    private constructor(
        private gl: WebGL2RenderingContext,
        private fontName: string,
        private size: TextRendererSize,
    ) {
        this.fontAtlas = TextRenderer.generateFontAtlas(gl, fontName, size);
        this.fitBounds();

        // create buffers & allocate space for character data
        this.screenPosBuf = gl.createBuffer();
        this.atlasPosBuf = gl.createBuffer();
        this.colorBuf = gl.createBuffer();
        this.allocateBuffers();

        // create program & bind attributes
        this.program = createProgram(gl, textVert, textFrag);
        this.vao = createVertexArray(gl, this.program, {
            aQuadVertPos: { buffer: createQuadBuffer(gl), itemSize: 2 },
            iCharAtlasPos: { buffer: this.atlasPosBuf, instanced: true, itemSize: 2 },
            iCharColor: { buffer: this.colorBuf, instanced: true, itemSize: 3 },
            iCharScreenPos: { buffer: this.screenPosBuf, instanced: true, itemSize: 2 },
        });
    }

    public static async new(
        gl: WebGL2RenderingContext,
        fontName: string,
        sizeSpec: TextRendererSizeSpec,
    ): Promise<TextRenderer> {
        await this.loadFont(fontName);
        return new TextRenderer(gl, fontName, this.computeSize(sizeSpec, fontName));
    }

    /**
     * Resize text renderer, regenerating font atlas if font size changed. Characters falling outside the new
     * text grid are hidden (but kept, reappearing if the grid grows again).
     * 
     * @param sizeSpec font size & output resolution
     */
    public resize(sizeSpec: TextRendererSizeSpec): void {
        const oldSize = this.size;
        this.size = TextRenderer.computeSize(sizeSpec, this.fontName);

        if (this.size.fontSize !== oldSize.fontSize) {
            this.gl.deleteTexture(this.fontAtlas.atlas);
            this.fontAtlas = TextRenderer.generateFontAtlas(this.gl, this.fontName, this.size);
        }

        if (this.size.gridDims[0] !== oldSize.gridDims[0] || this.size.gridDims[1] !== oldSize.gridDims[1]) {
            this.allocateBuffers();
        }

        this.fitBounds();
        this.staleBuffers = true;
    }

    /**
     * (Re)allocate data arrays & GPU buffers large enough to hold every tile in text grid.
     */
    private allocateBuffers(): void {
        const maxCharCount = this.size.gridDims[0] * this.size.gridDims[1];
        this.screenPosData = new Float32Array(maxCharCount * 2);
        this.atlasPosData = new Float32Array(maxCharCount * 2);
        this.colorData = new Float32Array(maxCharCount * 3);

        // reallocating storage of existing buffer objects keeps VAO bindings valid
        ([
            [this.screenPosBuf, this.screenPosData],
            [this.atlasPosBuf, this.atlasPosData],
            [this.colorBuf, this.colorData],
        ] as const).forEach(([buf, data]) => {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buf);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.DYNAMIC_DRAW);
        });
    }

    /**
     * Load font with given name into document (as subsetted to the default glyph set at compile time).
     * 
     * @param name name of font to load
     */
    private static async loadFont(name: string): Promise<void> {
        const font = new FontFace(
            name,
            `url(fonts/${name}.woff2) format("woff2")`
        );
        await font.load();
        document.fonts.add(font);
    }

    /**
     * Split Unicode string into graphemes.
     * 
     * @param str string to be split
     * @returns list of graphemes in given string
     */
    private static splitGraphemes(str: string): string[] {
        const itr = new Intl.Segmenter("en", { granularity: 'grapheme' }).segment(str);
        return Array.from(itr, ({ segment }) => segment);
    }

    /**
     * Convert text grid key into grid coordinates.
     * 
     * @param key key of tile in text grid
     * @returns grid coordinates of tile
     */
    private static parseKey(key: string): Pos {
        return key.split(",").map(Number) as Pos;
    }

    /**
     * Get width & height (in whole pixels) of full Unicode box character '█' when rendered in given font at given
     * size. Rounding up to whole pixels keeps glyphs aligned to the pixel grid, both on screen & in the atlas.
     * 
     * @param fontName name of font in which to render character
     * @param fontSize font size (in whole pixels) at which to render character
     * @returns width & height (in pixels) of rendered full Unicode box character, '█'
     */
    private static measureText(fontName: string, fontSize: number): Dimensions {
        this.measureCtx ??= document.createElement("canvas").getContext("2d");
        if (!this.measureCtx) throw new Error("Unable to measure font dimensions");

        this.measureCtx.font = `${fontSize.toFixed()}px ${fontName}`;
        const box = this.measureCtx.measureText("█");
        return [Math.ceil(box.width), Math.ceil(box.actualBoundingBoxAscent + box.actualBoundingBoxDescent)];
    }

    /**
     * Binary search for the largest font size at which given number of characters fit on one line within given
     * width.
     *
     * @param fontName name of font in which to render text
     * @param width maximum permissible width (in pixels) of line
     * @param chars number of characters in line
     * @returns optimal font size (in whole pixels)
     */
    public static fitFontSize(fontName: string, width: number, chars: number): number {
        let low = 1, high = 1000, best = 1;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (this.measureText(fontName, mid)[0] <= width / chars) {
                best = mid;
                low = mid + 1;
            } else high = mid - 1;
        }
        return best;
    }

    /**
     * Compute dimensions of characters rendered in given font size, & of the largest text grid fitting within
     * given resolution, less SCREEN_PADDING on each side.
     * 
     * @param sizeSpec font size & output resolution
     * @param fontName name of font in which to render text
     * @returns full specification of text grid size
     */
    private static computeSize({ fontSize, resolution }: TextRendererSizeSpec, fontName: string): TextRendererSize {
        const charDims = this.measureText(fontName, fontSize);
        const fit = (i: 0 | 1): number => Math.max(0, Math.floor((resolution[i] - 2 * SCREEN_PADDING) / charDims[i]));
        return { charDims, fontSize, gridDims: [fit(0), fit(1)], resolution };
    }

    /**
     * Convert given glyph set, which is a shorthand representation of a collection of Unicode glyphs, into a
     * list of the actual glyphs represented.
     * 
     * @param glyphSet shorthand representation of the collection of Unicode glyphs
     * @returns list of actual Unicode glyphs represented by given glyph set
     */
    private static expandGlyphSet(glyphSet: GlyphSet): string[] {
        const glyphs: string[] = [];
        glyphSet.forEach(set => {
            if (typeof set === "string") glyphs.push(...this.splitGraphemes(set));
            else {
                const [start, end] = set;
                const newGlyphs = Array.from({ length: end + 1 - start }, (_, k) => k + start)
                    .map(cp => String.fromCodePoint(cp));
                glyphs.push(...newGlyphs);
            }
        });
        return glyphs;
    }

    /**
     * Generate font atlas; this comprises a WebGL texture showing a grid of characters from the given glyph set,
     * pre-rendered in the given font (at the given font size).
     * 
     * @param gl WebGL rendering context
     * @param fontName name of font in which to render glyphs
     * @param textSize font size & size of each glyph in pixels
     * @returns object containing rendered atlas, size data, & map from glyph to top-left pixel of its cell in atlas
     */
    private static generateFontAtlas(gl: WebGL2RenderingContext, fontName: string, textSize: TextRendererSize): FontAtlas {
        // create canvas & context for atlas
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Unable to generate font atlas");

        const glyphs = this.expandGlyphSet(GLYPHS);
        const cols = 16; // columns of characters in atlas grid
        const rows = Math.ceil(glyphs.length / cols);
        const padding = 8; // prevent overlaps on atlas
        const atlasDims: Dimensions = [canvas.width, canvas.height] = [
            Math.ceil(cols * (textSize.charDims[0] + padding)),
            Math.ceil(rows * (textSize.charDims[1] + padding))
        ];

        // text style
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, ...atlasDims);
        ctx.font = `${textSize.fontSize.toFixed()}px ${fontName}`;
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        ctx.fillStyle = "white";

        // place baseline so that full box character '█' starts at top of its cell
        const ascent = ctx.measureText("█").actualBoundingBoxAscent;

        // populate atlas
        const charMap = new Map<string, Pos>();
        glyphs.forEach((g, i) => {
            const x = (i % cols) * (textSize.charDims[0] + padding);
            const y = Math.floor(i / cols) * (textSize.charDims[1] + padding);
            ctx.fillText(g, x, y + ascent);
            charMap.set(g, [x, y]);
        });

        return { atlas: createTexture(gl, canvas, gl.NEAREST), atlasDims, charMap };
    }

    /**
     * Fit text grid to given region, with its top-left corner at the region's top-left corner, & text wrapping at
     * the region's right edge (by default, the full grid is centred on the output).
     * 
     * @param bounds left, top, right, & bottom (in pixels from top-left of output) of region, or undefined to centre
     */
    public setBounds(bounds?: Rect): void {
        if (bounds?.every((b, i) => b === this.bounds?.[i]) ?? this.bounds === undefined) return;
        this.bounds = bounds;
        this.fitBounds();
        this.staleBuffers = true;
    }

    /**
     * Compute portion of text grid in use & its position, from bounds (clipped to output, less SCREEN_PADDING) if
     * set, or else the full grid centred on output, aligned to whole pixels. Characters falling outside the portion
     * in use are hidden.
     */
    private fitBounds(): void {
        const { charDims, gridDims, resolution } = this.size;
        if (!this.bounds) {
            this.gridDims = gridDims;
            this.origin = [
                Math.floor((resolution[0] - gridDims[0] * charDims[0]) / 2),
                Math.floor((resolution[1] - gridDims[1] * charDims[1]) / 2),
            ];
            return;
        }

        const [left, top, right, bottom] = this.bounds;
        const fit = (i: 0 | 1, start: number, end: number): number => Math.max(0, Math.min(gridDims[i],
            Math.floor((Math.min(end, resolution[i] - SCREEN_PADDING) - start) / charDims[i])));
        this.gridDims = [fit(0, left, right), fit(1, top, bottom)];
        this.origin = [left, top];
    }

    /**
     * Delete all character tiles, & reset cursor.
     */
    public clear(): void {
        this.textGrid.clear();
        this.cursorPos = [0, 0];
        this.staleBuffers = true;
    }

    /**
     * Check whether given grid coordinates lie within portion of text grid in use.
     * 
     * @param coords grid coordinates of character tile
     * @returns whether tile lies within text grid
     */
    private inGrid([x, y]: Pos): boolean {
        return x >= 0 && x < this.gridDims[0] && y >= 0 && y < this.gridDims[1];
    }

    /**
     * Assign given character of given color to the tile with given coordinates, unless tile lies outside text grid
     * or character is missing from font atlas.
     * 
     * @param coords grid coordinates of character tile
     * @param ch character to assign
     * @param color RGB color of character
     */
    private setChar(coords: Pos, ch: string, color: RGB): void {
        if (!this.inGrid(coords) || !this.fontAtlas.charMap.has(ch)) return;
        this.textGrid.set(`${coords[0].toFixed()},${coords[1].toFixed()}`, { ch, color });
        this.staleBuffers = true;
    }

    /**
     * Print given text at cursor position, advancing cursor, & wrapping text at end of each row. Text beyond the
     * last row is discarded.
     * 
     * @param text text to print
     * @param color RGB color of text
     */
    public print(text: string, color: RGB = [1, 1, 1]): void {
        for (const ch of TextRenderer.splitGraphemes(text)) {
            if (ch === "\n" || this.cursorPos[0] >= this.gridDims[0]) { // wrap text
                this.cursorPos[0] = 0;
                this.cursorPos[1]++;
            }
            if (this.cursorPos[1] >= this.gridDims[1]) return; // out of lines
            if (ch !== "\n") this.setChar([this.cursorPos[0]++, this.cursorPos[1]], ch, color);
        }
    }

    /**
     * Get render pass drawing text grid (as one instanced quad per character), refreshing GPU buffers if needed.
     * 
     * @returns render pass drawing text grid
     */
    public renderPass(): RenderPass {
        if (this.staleBuffers) this.refreshBuffers();

        return {
            blend: true,
            composition: { ignoreInput: true, mode: "parallel" },
            instances: this.instanceCount,
            program: this.program,
            uniforms: {
                uAtlas: { type: "tex", value: this.fontAtlas.atlas },
                uAtlasSize: { type: "2f", value: this.fontAtlas.atlasDims },
                uGlyphSize: { type: "2f", value: this.size.charDims },
                uResolution: { type: "2f", value: this.size.resolution },
            },
            vao: this.vao,
        };
    }

    /**
     * Write position, atlas location, & color of each character tile to GPU buffers.
     */
    private refreshBuffers(): void {
        const { charDims } = this.size;
        const [originX, originY] = this.origin;

        // write character details to data arrays to send to GPU, skipping tiles hidden by resizing
        let i = 0;
        for (const [key, tile] of this.textGrid) {
            const [gridX, gridY] = TextRenderer.parseKey(key);
            if (!this.inGrid([gridX, gridY])) continue;
            this.screenPosData.set([originX + gridX * charDims[0], originY + gridY * charDims[1]], i * 2);
            this.atlasPosData.set(this.fontAtlas.charMap.get(tile.ch) ?? [0, 0], i * 2);
            this.colorData.set(tile.color, i * 3);
            i++;
        }

        // upload only the portion of each array in use
        ([
            [this.screenPosBuf, this.screenPosData, 2],
            [this.atlasPosBuf, this.atlasPosData, 2],
            [this.colorBuf, this.colorData, 3],
        ] as const).forEach(([buf, data, itemSize]) => {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buf);
            this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, data, 0, i * itemSize);
        });
        this.instanceCount = i;
        this.staleBuffers = false;
    }
}