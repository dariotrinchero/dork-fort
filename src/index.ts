interface FontAtlas {
    canvas: HTMLCanvasElement;
    charMap: Map<string, { x: number; y: number; }>;
}

import type { VertexAttribs } from "types/renderPass";

import { createInstanceBuffer, createProgram } from "webglHelpers";

import RenderPass from "renderPass";
import RenderPipeline from "renderPipeline";

// shader source code
import screenVert from "shaders/screen.vert";
import crtFrag from "shaders/crt.frag";
import warpFrag from "shaders/warp.frag";
import textFrag from "shaders/text.frag";
import textVert from "shaders/text.vert";

// font name
const FONT_NAME = "DejaVuSansMono";

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

// determines on-screen size of CRT scanlines
const CRT_RES_MULT = 0.6;

const loadFont = async (name: string): Promise<void> => {
    const font = new FontFace(
        "DejaVuSansMono",
        `url(public/${name}.woff) format("woff"),
         url(public/${name}.ttf) format("truetype"),
         url(public/${name}.eot) format("embedded-opentype")`
    );
    await font.load();
    document.fonts.add(font);
};

const generateFontAtlas = async (name: string): Promise<FontAtlas> => {
    await loadFont(name);

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
    };

    return { canvas, charMap };
};

// TODO consolidate with createTexture in webglHelpers.ts
const createAtlasTexture = (gl: WebGL2RenderingContext, atlasCanvas: HTMLCanvasElement): WebGLTexture => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return tex;
};

window.onload = async () => {
    // canvas & rendering context
    const canvas = document.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2")!;

    // dimensions
    const screenDims: [number, number] = [canvas.width, canvas.height] = [window.innerWidth, window.innerHeight];
    const texDims: [number, number] = [Math.floor(CRT_RES_MULT * screenDims[0]), Math.floor(CRT_RES_MULT * screenDims[1])];

    // fullscreen quad geometry
    const fsQuad = createInstanceBuffer(gl, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]));
    const geometryAttrib: VertexAttribs = { aPos: { buffer: fsQuad, size: 2 } };

    // generate font atlas
    const fontAtlas = await generateFontAtlas(FONT_NAME);
    const fontTexture = createAtlasTexture(gl, fontAtlas.canvas);

    // create instance buffers
    const exampleText = "Hello, world!"; // TODO only example

    const numInstances = exampleText.length;

    const charPosData = new Float32Array(numInstances * 2);
    const charUVData = new Float32Array(numInstances * 2);
    const charColorData = new Float32Array(numInstances * 3);

    [...exampleText].forEach((ch, i) => { // split characters with spread for unicode safety
        const { x, y } = fontAtlas.charMap.get(ch) ?? { x: 0, y: 0 };
        charPosData.set([i * GLYPH_SIZE, 0], i * 2);
        charUVData.set([x, y], i * 2);
        charColorData.set([1, 1, 1], i * 3); // all characters white
    });

    const charPosBuf = createInstanceBuffer(gl, charPosData);
    const charUVBuf = createInstanceBuffer(gl, charUVData);
    const charColorBuf = createInstanceBuffer(gl, charColorData);

    // render passes & pipeline
    const pipeline = new RenderPipeline(gl, texDims);
    const textPass = new RenderPass(gl, createProgram(gl, textVert, textFrag), texDims); // TODO should this get the same dimensions?
    const crtPass = new RenderPass(gl, createProgram(gl, screenVert, crtFrag), texDims);
    const warpPass = new RenderPass(gl, createProgram(gl, screenVert, warpFrag), screenDims);

    // animation loop
    const render = (time: number) => {
        pipeline.runPasses([
            // {
            //     pass: textPass,
            //     uniforms: {
            //         uGlyphSize: { type: "2f", value: [GLYPH_SIZE, GLYPH_SIZE] },
            //         uAtlasSize: { type: "2f", value: [ATLAS_WIDTH, ATLAS_HEIGHT] },
            //         uResolution: { type: "2f", value: texDims },
            //         uAtlas: { type: "tex", value: { tex: fontTexture } }
            //     },
            //     attribs: {
            //         ...geometryAttrib, // TODO should this get the same geometry?
            //         iCharPos: { buffer: charPosBuf, size: 2 },
            //         iCharUV: { buffer: charUVBuf, size: 2 },
            //         iCharColor: { buffer: charColorBuf, size: 3 }
            //     },
            //     instances: numInstances
            // },
            {
                pass: crtPass,
                uniforms: {
                    uResolution: { type: "2f", value: texDims },
                    uTime: { type: "1f", value: time * 0.001 }
                },
                attribs: geometryAttrib,
                needsPrevPassOutput: true
            },
            {
                pass: warpPass,
                uniforms: {},
                attribs: geometryAttrib,
            },
        ]);
        requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
};