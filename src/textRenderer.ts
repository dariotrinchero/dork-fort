import type { Dimensions, Pos, RGB } from "types/global";
import type { RenderPassData } from "types/renderPipeline";
import type { CharTile, FontAtlas, GlyphSet, TextRendererSize, TextRendererSizeSpec, TextSize } from "types/textRenderer";

import { arrayBufFromData, createProgram, createTexture } from "webglHelpers";

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

const SCREEN_PADDING = 10;

export default class TextRenderer {
    private textGrid: Map<string, CharTile> = new Map<string, CharTile>();
    private cursorPos: Pos = [0, 0];
    private staleBuffers = true;

    private program: WebGLProgram;

    // buffers & their data arrays
    private screenPosData: Float32Array;
    private atlasPosData: Float32Array;
    private colorData: Float32Array;
    private screenPosBuf: WebGLBuffer;
    private atlasPosBuf: WebGLBuffer;
    private colorBuf: WebGLBuffer;
    private clipQuadBuf: WebGLBuffer;

    private constructor(
        private gl: WebGL2RenderingContext,
        private fontAtlas: FontAtlas,
        private size: TextRendererSize,
    ) {
        // allocate space for character data
        const maxCharCount = this.size.gridDims[0] * this.size.gridDims[1];

        this.screenPosData = new Float32Array(maxCharCount * 2);
        this.atlasPosData = new Float32Array(maxCharCount * 2);
        this.colorData = new Float32Array(maxCharCount * 3);

        // create buffers
        this.screenPosBuf = arrayBufFromData(gl, this.screenPosData);
        this.atlasPosBuf = arrayBufFromData(gl, this.atlasPosData);
        this.colorBuf = arrayBufFromData(gl, this.colorData);
        this.clipQuadBuf = arrayBufFromData(gl, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]));

        // create render pass
        this.program = createProgram(gl, textVert, textFrag);
    }

    public static async new(
        gl: WebGL2RenderingContext,
        fontName: string,
        sizeSpec: TextRendererSizeSpec,
        glyphSet: GlyphSet = DEFAULT_GLYPHS,
    ): Promise<TextRenderer> {
        await this.loadFont(fontName);
        const size = this.computeMissingDims(sizeSpec, fontName);
        console.debug("Text renderer dimensions: ", JSON.stringify(size, undefined, 2)); // TODO delete this?
        const atlas = this.generateFontAtlas(gl, fontName, size, glyphSet);
        return new TextRenderer(gl, atlas, size);
    }

    /**
     * Load font with given name into document.
     * 
     * @param name name of font to load
     */
    private static async loadFont(name: string): Promise<void> {
        const font = new FontFace(
            "DejaVuSansMono",
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
     * Get width & height (in pixels) of full Unicode box character '█' when rendered in given font at given size.
     * 
     * @param ctx 2D canvas rendering context to use for measurement
     * @param fontName name of font in which to render character
     * @param fontSize font size at which to render character
     * @returns width & height (in pixels) of rendered full Unicode box character, '█'
     */
    private static measureText(ctx: CanvasRenderingContext2D, fontName: string, fontSize: number): Dimensions {
        ctx.font = `${fontSize.toFixed()}px ${fontName}`;
        const box = ctx.measureText("█");
        return [box.width, box.actualBoundingBoxAscent + box.actualBoundingBoxDescent];
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
            const mid = (low + high) / 2;
            const charDims = this.measureText(ctx, fontName, mid);
            if (charDims[0] <= charBounds[0] && charDims[1] <= charBounds[1]) {
                best = mid;
                low = mid + 0.5;
            } else high = mid - 0.5;
        }
        return { fontSize: best, charDims: this.measureText(ctx, fontName, best) };
    }

    /**
     * Given any two of the following sizes,
     * (1) font size, (2) grid size, (3) resolution,
     * compute the third (and the dimensions of characters as rendered in the font size).
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
                resolution = [charDims[0] * gridDims[0], charDims[1] * gridDims[1]];
            } else { // get grid dimensions from resolution & character dimensions
                resolution = sizeSpec.resolution;
                gridDims = [Math.floor(resolution[0] / charDims[0]), Math.floor(resolution[1] / charDims[1])];
            }
        } else { // get character dimensions from resolution & grid dimensions;
            resolution = sizeSpec.resolution;
            gridDims = sizeSpec.gridDims;

            // find largest font size such that characters fit within grid cells
            const cellDims: Dimensions = [resolution[0] / gridDims[0], resolution[1] / gridDims[1]];
            const textSize = this.findFontSize(ctx, fontName, cellDims);
            fontSize = textSize.fontSize;
            charDims = textSize.charDims;

            if (!sizeSpec.preserveGridDims) {
                // unless overridden, recompute grid dimensions, since (due to font size quantization) characters ma
                //  not perfectly fill current grid cells
                gridDims = [Math.floor(resolution[0] / charDims[0]), Math.floor(resolution[1] / charDims[1])];
            }
        }

        tmp.remove(); // clean up by removing temporary canvas
        return { charDims, resolution, gridDims, fontSize };
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
     * @returns object containing rendered atlas, size data, & map from glyph to uv-coordinates in atlas
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
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillStyle = "white";

        // populate atlas
        const charMap = new Map<string, Pos>();
        glyphs.forEach((g, i) => {
            const x = (i % cols + 0.5) * (textSize.charDims[0] + padding);
            const y = (Math.floor(i / cols) + 0.5) * (textSize.charDims[1] + padding);
            ctx.fillText(g, x, y);
            charMap.set(g, [x, y]);
        });

        return { atlas: createTexture(gl, atlasDims, canvas, gl.NEAREST), charMap, atlasDims };
    };

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
     * TODO
     * 
     * @param text 
     * @param color 
     */
    public print(text: string, color: RGB = [1, 1, 1]): void {
        for (const ch of TextRenderer.splitGraphemes(text)) {
            if (this.cursorPos[1] >= this.size.gridDims[1] - 1) return; // out of lines
            if (ch === "\n" || this.cursorPos[0] === this.size.gridDims[0] - 1) { // wrap text
                this.cursorPos[0] = 0;
                this.cursorPos[1]++;
            }
            if (ch !== "\n") this.setChar([this.cursorPos[0]++, this.cursorPos[1]], ch, color);
        }
    }

    /**
     * TODO
     * 
     * @returns 
     */
    public renderPassData(): RenderPassData {
        if (this.staleBuffers) this.refreshBuffers();

        return {
            program: this.program,
            uniforms: {
                uGlyphSize: { type: "2f", value: this.size.charDims },
                uAtlasSize: { type: "2f", value: this.fontAtlas.atlasDims },
                uResolution: { type: "2f", value: this.size.resolution },
                uAtlas: { type: "tex", value: { tex: this.fontAtlas.atlas } }
            },
            attribs: {
                aQuadVertPos: { buffer: this.clipQuadBuf, itemSize: 2 },
                iCharScreenPos: { buffer: this.screenPosBuf, itemSize: 2, instanced: true },
                iCharAtlasPos: { buffer: this.atlasPosBuf, itemSize: 2, instanced: true },
                iCharColor: { buffer: this.colorBuf, itemSize: 3, instanced: true }
            },
            instances: this.textGrid.size
        };
    }

    /**
     * TODO
     * 
     * @returns total number of characters (instance count)
     */
    private refreshBuffers(): void {
        // write character details to data arrays to send to GPU
        let i = 0;
        for (const [key, tile] of this.textGrid) {
            const [gridX, gridY] = key.split(",").map(Number) as [number, number];
            this.screenPosData.set([
                SCREEN_PADDING + (gridX + 0.5) * this.size.charDims[0],
                SCREEN_PADDING + (gridY + 0.5) * this.size.charDims[1]
            ], i * 2);
            this.atlasPosData.set(this.fontAtlas.charMap.get(tile.ch) ?? [0, 0], i * 2);
            this.colorData.set(tile.color, i * 3);
            i++;
        }

        // reassign buffer data
        this.screenPosBuf = arrayBufFromData(this.gl, this.screenPosData, this.screenPosBuf);
        this.atlasPosBuf = arrayBufFromData(this.gl, this.atlasPosData, this.atlasPosBuf);
        this.colorBuf = arrayBufFromData(this.gl, this.colorData, this.colorBuf);
        this.staleBuffers = false;
    }
}