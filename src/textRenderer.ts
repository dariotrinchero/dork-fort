import type { Dimensions, Pos, RGB } from "types/global";
import type { RenderPassData } from "types/renderPipeline";
import type { CharTile, FontAtlas, GlyphSet } from "types/textRenderer";

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
    private gridDims: Dimensions;
    private staleBuffers: boolean = true;

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
        private textureDims: Dimensions,
    ) {
        // allocate space for character data
        this.gridDims = [
            Math.floor(textureDims[0] / fontAtlas.charDims[0]),
            Math.floor(textureDims[1] / fontAtlas.charDims[1])
        ];
        const maxCharCount = this.gridDims[0] * this.gridDims[1];
        console.debug("Grid dimensions", ...this.gridDims); // TODO delete

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
        fontSize: number,
        textureDims: Dimensions,
        glyphSet: GlyphSet = DEFAULT_GLYPHS,
    ): Promise<TextRenderer> {
        await this.loadFont(fontName);

        const atlas = this.generateFontAtlas(gl, fontName, fontSize, glyphSet);
        return new TextRenderer(gl, atlas, textureDims);
    }

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

    private static generateFontAtlas(
        gl: WebGL2RenderingContext,
        fontName: string,
        fontSize: number,
        glyphSet: GlyphSet,
        cols: number = 16
    ): FontAtlas {
        // collect glyphs to render
        const glyphs: string[] = [];
        glyphSet.forEach(set => {
            if (typeof set === "string") glyphs.push(...set);
            else {
                const [start, end] = set;
                const newGlyphs = Array.from({ length: end + 1 - start }, (_, k) => k + start)
                    .map(cp => String.fromCodePoint(cp));
                glyphs.push(...newGlyphs);
            }
        });

        // measure text dimensions (using temporary canvas)
        const tmp = document.createElement("canvas").getContext("2d")!;
        tmp.font = `${fontSize}px ${fontName}`;
        const fullBox = tmp.measureText("█");
        const charDims: Dimensions = [
            fullBox.width,
            fullBox.actualBoundingBoxAscent + fullBox.actualBoundingBoxDescent
        ];

        // create canvas & context
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;

        const rows = Math.ceil(glyphs.length / cols);
        const padding = 8; // prevent overlaps on atlas
        const atlasDims: Dimensions = [canvas.width, canvas.height] = [
            Math.ceil(cols * (charDims[0] + padding)),
            Math.ceil(rows * (charDims[1] + padding))
        ];

        // text style
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, ...atlasDims);
        ctx.font = `${fontSize}px ${fontName}`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillStyle = "white";

        // populate atlas
        const charMap = new Map<string, Pos>();
        glyphs.forEach((g, i) => {
            const x = (i % cols + 0.5) * (charDims[0] + padding);
            const y = (Math.floor(i / cols) + 0.5) * (charDims[1] + padding);
            ctx.fillText(g, x, y);
            charMap.set(g, [x, y]);
        });

        return { atlas: createTexture(gl, atlasDims, canvas, gl.NEAREST), charMap, charDims, atlasDims };
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
        let valid = x >= 0 && x < this.gridDims[0] && y >= 0 && y < this.gridDims[1];
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
        this.textGrid.set(`${coords[0]},${coords[1]}`, { ch, color });
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
        this.textGrid.delete(`${coords[0]},${coords[1]}`);
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
        return this.textGrid.get(`${coords[0]},${coords[1]}`);
    }

    /**
     * TODO
     * 
     * @param text 
     * @param color 
     */
    public print(text: string, color: RGB = [1, 1, 1]): void {
        for (const ch of [...text]) {
            if (this.cursorPos[1] >= this.gridDims[1] - 1) return; // out of lines
            if (ch === "\n" || this.cursorPos[0] === this.gridDims[0] - 1) { // wrap text
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
                uGlyphSize: { type: "2f", value: this.fontAtlas.charDims },
                uAtlasSize: { type: "2f", value: this.fontAtlas.atlasDims },
                uResolution: { type: "2f", value: this.textureDims },
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
        const { charMap, charDims } = this.fontAtlas;

        let i = 0;
        for (const [key, tile] of this.textGrid) {
            const [gridX, gridY] = key.split(",").map(Number);
            this.screenPosData.set([
                SCREEN_PADDING + (gridX! + 0.5) * charDims[0],
                SCREEN_PADDING + (gridY! + 0.5) * charDims[1]
            ], i * 2);
            this.atlasPosData.set(charMap.get(tile.ch) ?? [0, 0], i * 2);
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