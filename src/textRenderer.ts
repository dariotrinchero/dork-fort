interface FontAtlas {
    canvas: HTMLCanvasElement;
    charMap: Map<string, { x: number; y: number; }>;
}

// character range
const CHAR_START = 32;
const CHAR_END = 126;
const GLYPH_COUNT = CHAR_END - CHAR_START + 1;

// grid dimensions of atlas
const COLS = 16;
const ROWS = Math.ceil(GLYPH_COUNT / COLS);

// pixel dimensions of each character
const GLYPH_SIZE = 32;

// pixel dimensions of atlas
const ATLAS_WIDTH = COLS * GLYPH_SIZE;
const ATLAS_HEIGHT = ROWS * GLYPH_SIZE;

export default class TextRenderer {
    private atlas?: FontAtlas;
    private texture?: WebGLTexture;
    private quadVBO: WebGLBuffer;

    constructor(
        private gl: WebGL2RenderingContext,
        fontName: string
    ) {
        this.generateFontAtlas(fontName).then(atlas => {
            this.atlas = atlas;
            this.texture = this.createAtlasTexture(gl, atlas.canvas);
        });

        // create static quad geometry
        const quadVerts = new Float32Array([
            -1, -1, 1, -1, 1, 1,
            -1, -1, 1, 1, -1, 1
        ]);
        this.quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    }

    private async loadFont(name: string): Promise<void> {
        const font = new FontFace(
            "DejaVuSansMono",
            `url(public/${name}.woff) format("woff"),
         url(public/${name}.ttf) format("truetype"),
         url(public/${name}.eot) format("embedded-opentype")`
        );
        await font.load();
        document.fonts.add(font);
    }

    private async generateFontAtlas(name: string): Promise<FontAtlas> {
        await this.loadFont(name);

        const canvas = document.createElement("canvas");
        canvas.width = ATLAS_WIDTH;
        canvas.height = ATLAS_HEIGHT;

        const ctx = canvas.getContext("2d")!;
        ctx.font = `${GLYPH_SIZE}px ${name}`;
        ctx.textBaseline = "top";
        ctx.fillStyle = "white";

        const charMap = new Map<string, { x: number, y: number; }>();
        let i = 0;
        for (let code = CHAR_START; code <= CHAR_END; code++) {
            const ch = String.fromCharCode(code);
            const x = (i % COLS) * GLYPH_SIZE;
            const y = Math.floor(i / COLS) * GLYPH_SIZE;
            ctx.fillText(ch, x, y);
            charMap.set(ch, { x, y });
            i++;
        }

        return { canvas, charMap };
    }

    private createAtlasTexture(gl: WebGL2RenderingContext, atlasCanvas: HTMLCanvasElement): WebGLTexture {
        const tex = this.gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        return tex;
    }
};