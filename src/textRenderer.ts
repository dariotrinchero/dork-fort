import type { CharTile, FontAtlas, GlyphSet, TextRendererSize, TextRendererSizeSpec, TextSize } from "types/textRenderer";
import type { Dimensions, Pos, RGB } from "types/global";
import type { RenderPass } from "types/renderPipeline";

import { createProgram, createQuadBuffer, createTexture, createVertexArray } from "webglHelpers";

// shader source code
import textFrag from "shaders/text.frag";
import textVert from "shaders/text.vert";

const DEFAULT_GLYPHS: GlyphSet = [
    [32, 126], // printable ASCII range
    [0x2500, 0x259F], // box characters
    "☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼⌂ÇüéâäàåçêëèïîìÄÅÉæÆôöòû", // Dwarf Fortress tiles
    "ùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■",
    "—…〉", // miscellaneous
];

const SCREEN_PADDING = 10; // minimum padding (in pixels) around text grid

export default class TextRenderer {
    private textGrid: Map<string, CharTile> = new Map<string, CharTile>();
    private cursorPos: Pos = [0, 0];
    private staleBuffers = true;
    private instanceCount = 0; // number of character tiles within text grid

    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private fontAtlas: FontAtlas;

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
        private glyphSet: GlyphSet,
        private size: TextRendererSize,
    ) {
        this.fontAtlas = TextRenderer.generateFontAtlas(gl, fontName, size, glyphSet);

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
        glyphSet: GlyphSet = DEFAULT_GLYPHS,
    ): Promise<TextRenderer> {
        await this.loadFont(fontName);
        const size = this.computeMissingDims(sizeSpec, fontName);
        return new TextRenderer(gl, fontName, glyphSet, size);
    }

    /**
     * Resize text renderer, regenerating font atlas if font size changed. Characters falling outside the new
     * text grid are hidden (but kept, reappearing if the grid grows again).
     * 
     * @param sizeSpec specification of text grid sizes, where one of 3 sizes is omitted
     */
    public resize(sizeSpec: TextRendererSizeSpec): void {
        const oldSize = this.size;
        this.size = TextRenderer.computeMissingDims(sizeSpec, this.fontName);

        if (this.size.fontSize !== oldSize.fontSize) {
            this.gl.deleteTexture(this.fontAtlas.atlas);
            this.fontAtlas = TextRenderer.generateFontAtlas(this.gl, this.fontName, this.size, this.glyphSet);
        }

        if (this.size.gridDims[0] !== oldSize.gridDims[0] || this.size.gridDims[1] !== oldSize.gridDims[1]) {
            this.allocateBuffers();
        }

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
     * Load font with given name into document.
     * 
     * @param name name of font to load
     */
    private static async loadFont(name: string): Promise<void> {
        const font = new FontFace(
            name,
            `url(public/${name}.woff) format("woff"),
            url(public/${name}.ttf) format("truetype"),
            url(public/${name}.eot) format("embedded-opentype")`
        );
        await font.load();
        document.fonts.add(font);
    };

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
     * @param ctx 2D canvas rendering context to use for measurement
     * @param fontName name of font in which to render character
     * @param fontSize font size (in whole pixels) at which to render character
     * @returns width & height (in pixels) of rendered full Unicode box character, '█'
     */
    private static measureText(ctx: CanvasRenderingContext2D, fontName: string, fontSize: number): Dimensions {
        ctx.font = `${fontSize.toFixed()}px ${fontName}`;
        const box = ctx.measureText("█");
        return [Math.ceil(box.width), Math.ceil(box.actualBoundingBoxAscent + box.actualBoundingBoxDescent)];
    }

    /**
     * Binary search for the largest font size such that characters (specifically the full Unicode box character,
     * '█') fit within given bounds.
     * 
     * @param ctx 2D canvas rendering context to use for measurement
     * @param fontName name of font in which to render character
     * @param charBounds maximum permissible dimensions (in pixels) of rendered full Unicode box character, '█'
     * @returns optimal font size & measurements of full Unicode box character, '█'
     */
    private static findFontSize(ctx: CanvasRenderingContext2D, fontName: string, charBounds: Dimensions): TextSize {
        let low = 1, high = 1000, best = 1;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const charDims = this.measureText(ctx, fontName, mid);
            if (charDims[0] <= charBounds[0] && charDims[1] <= charBounds[1]) {
                best = mid;
                low = mid + 1;
            } else high = mid - 1;
        }
        return { charDims: this.measureText(ctx, fontName, best), fontSize: best };
    }

    /**
     * Given any two of the following sizes,
     * (1) font size, (2) grid size, (3) resolution,
     * compute the third (and the dimensions of characters as rendered in the font size). The text grid is
     * fitted within the resolution, less SCREEN_PADDING on each side.
     * 
     * @param sizeSpec specification of text grid sizes, where one of 3 sizes is omitted
     * @param fontName name of font in which to render text
     * @returns full specification of text grid size, with missing dimensions computed
     */
    private static computeMissingDims(sizeSpec: TextRendererSizeSpec, fontName: string): TextRendererSize {
        // create temporary canvas to measure text dimensions
        const tmp = document.createElement("canvas");
        const ctx = tmp.getContext("2d");
        if (!ctx) throw new Error("Unable to measure font dimensions");

        // declare dimensions we need
        const pad = 2 * SCREEN_PADDING;
        let fontSize: number;
        let charDims: Dimensions;
        let resolution: Dimensions;
        let gridDims: Dimensions;

        // compute missing set of dimensions from other two given in size spec
        if (sizeSpec.fontSize !== undefined) {
            fontSize = sizeSpec.fontSize;
            charDims = this.measureText(ctx, fontName, fontSize);

            if (sizeSpec.gridDims !== undefined) { // get resolution from grid & character dimensions
                gridDims = sizeSpec.gridDims;
                resolution = [charDims[0] * gridDims[0] + pad, charDims[1] * gridDims[1] + pad];
            } else { // get grid dimensions from resolution & character dimensions
                resolution = sizeSpec.resolution;
                gridDims = this.fitGrid(resolution, charDims);
            }
        } else { // get character dimensions from resolution & grid dimensions;
            resolution = sizeSpec.resolution;
            gridDims = sizeSpec.gridDims;

            // find largest font size such that characters fit within grid cells
            const cellDims: Dimensions = [(resolution[0] - pad) / gridDims[0], (resolution[1] - pad) / gridDims[1]];
            const textSize = this.findFontSize(ctx, fontName, cellDims);
            fontSize = textSize.fontSize;
            charDims = textSize.charDims;

            if (!sizeSpec.preserveGridDims) {
                // unless overridden, recompute grid dimensions, since (due to font size quantization) characters ma
                //  not perfectly fill current grid cells
                gridDims = this.fitGrid(resolution, charDims);
            }
        }

        tmp.remove(); // clean up by removing temporary canvas
        return { charDims, fontSize, gridDims, resolution };
    }

    /**
     * Compute largest text grid fitting within given resolution (less padding).
     * 
     * @param resolution resolution (in pixels) of output
     * @param charDims dimensions (in pixels) of each character
     * @returns grid dimensions
     */
    private static fitGrid(resolution: Dimensions, charDims: Dimensions): Dimensions {
        const fit = (i: 0 | 1): number => Math.max(0, Math.floor((resolution[i] - 2 * SCREEN_PADDING) / charDims[i]));
        return [fit(0), fit(1)];
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
     * @param glyphSet shorthand representation of the collection of Unicode glyphs to be rendered
     * @param cols number of columns of characters in the atlas' grid
     * @returns object containing rendered atlas, size data, & map from glyph to top-left pixel of its cell in atlas
     */
    private static generateFontAtlas(
        gl: WebGL2RenderingContext,
        fontName: string,
        textSize: TextSize,
        glyphSet: GlyphSet,
        cols = 16
    ): FontAtlas {
        // create canvas & context for atlas
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Unable to generate font atlas");

        const glyphs = this.expandGlyphSet(glyphSet);
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
    };

    /**
     * Get various dimensions associated with the text renderer, including (1) font size, (2) grid size,
     * (3) resolution, & (4) dimensions (in pixels) of rendered full Unicode box character, '█'.
     * 
     * @returns various dimensions associated with text grid
     */
    public getSize(): TextRendererSize {
        return this.size;
    }

    /**
     * Check whether given coordinates (and optionally character & color) denote a valid tile.
     * 
     * @param coords grid coordinates of character
     * @param ch character at given coordinates
     * @param color RGB color of character
     * @returns whether coordinates, character, and color are all well-formed
     */
    private validTile(coords: Pos, ch?: string, color?: RGB): boolean {
        const [x, y] = coords;
        let valid = x >= 0 && x < this.size.gridDims[0] && y >= 0 && y < this.size.gridDims[1];
        if (ch !== undefined) valid &&= this.fontAtlas.charMap.get(ch) !== undefined;
        if (color !== undefined) {
            const [r, g, b] = color;
            valid &&= r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1;
        }
        return valid;
    }

    /**
     * Assigns given character of given color to the tile with given coordinates.
     * 
     * @param coords grid coordinates of character tile
     * @param ch character to assign
     * @param color RGB color of character
     * @returns whether assignment succeeded
     */
    public setChar(coords: Pos, ch: string, color: RGB = [1, 1, 1]): boolean {
        if (!this.validTile(coords, ch, color)) return false;
        this.textGrid.set(`${coords[0].toFixed()},${coords[1].toFixed()}`, { ch, color });
        this.staleBuffers = true;
        return true;
    }

    /**
     * Deletes character tile at given coordinates.
     * 
     * @param coords grid coordinates of character tile
     * @returns whether deletion succeeded
     */
    public delChar(coords: Pos): boolean {
        if (!this.validTile(coords)) return false;
        this.textGrid.delete(`${coords[0].toFixed()},${coords[1].toFixed()}`);
        this.staleBuffers = true;
        return true;
    }

    /**
     * Returns character tile at given coordinates.
     * 
     * @param coords grid coordinates of character tile
     * @returns character tile at given coordinates (possibly undefined)
     */
    public getChar(coords: Pos): CharTile | undefined {
        if (!this.validTile(coords)) return undefined;
        return this.textGrid.get(`${coords[0].toFixed()},${coords[1].toFixed()}`);
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
            if (ch === "\n" || this.cursorPos[0] >= this.size.gridDims[0]) { // wrap text
                this.cursorPos[0] = 0;
                this.cursorPos[1]++;
            }
            if (this.cursorPos[1] >= this.size.gridDims[1]) return; // out of lines
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
        const { charDims, gridDims, resolution } = this.size;

        // center text grid on output, aligned to whole pixels
        const origin: Pos = [
            Math.floor((resolution[0] - gridDims[0] * charDims[0]) / 2),
            Math.floor((resolution[1] - gridDims[1] * charDims[1]) / 2),
        ];

        // write character details to data arrays to send to GPU, skipping tiles hidden by resizing
        let i = 0;
        for (const [key, tile] of this.textGrid) {
            const [gridX, gridY] = TextRenderer.parseKey(key);
            if (!this.validTile([gridX, gridY])) continue;
            this.screenPosData.set([origin[0] + gridX * charDims[0], origin[1] + gridY * charDims[1]], i * 2);
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