interface FontAtlas {
    atlas: WebGLTexture;
    charMap: Map<string, { x: number; y: number; }>;
    charDims: [number, number]; // dimensions of each character
    atlasDims: [number, number]; // dimensions of atlas
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

// font
const FONT_NAME = "DejaVuSansMono";
const FONT_SIZE = 32;

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

const generateFontAtlas = async (
    gl: WebGL2RenderingContext,
    fontName: string,
    fontSize: number,
    cols: number = 16
): Promise<FontAtlas> => {
    // character range
    const charStart = 32;
    const charEnd = 126;
    const glyphCount = charEnd - charStart + 1;

    // dimensions of atlas
    const rows = Math.ceil(glyphCount / cols);
    const padding = 2; // prevent overlaps on atlas

    // measure text width (using temporary canvas)
    await loadFont(fontName);
    const tmp = document.createElement("canvas").getContext("2d")!;
    tmp.font = `${fontSize}px ${fontName}`;
    const charDims: [number, number] = [tmp.measureText("M").width, fontSize];

    // create canvas & context
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const atlasDims: [number, number] = [canvas.width, canvas.height] = [
        Math.ceil(cols * (charDims[0] + padding)),
        Math.ceil(rows * (charDims[1] + padding))
    ];

    // set text style
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, ...atlasDims);
    ctx.font = `${fontSize}px ${fontName}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = "white";

    // populate atlas
    const charMap = new Map<string, { x: number, y: number; }>();
    let i = 0;
    for (let code = charStart; code <= charEnd; code++) {
        const ch = String.fromCharCode(code);
        const x = (i % cols) * (charDims[0] + padding);
        const y = Math.floor(i / cols) * (charDims[1] + padding);
        ctx.fillText(ch, x, y);
        charMap.set(ch, { x, y });
        i++;
    };

    return { atlas: createAtlasTexture(gl, canvas), charMap, charDims, atlasDims };
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
    const geometryAttrib: VertexAttribs = { aPos: { buffer: fsQuad, itemSize: 2 } };

    // generate font atlas
    const { atlas, atlasDims, charDims, charMap } = await generateFontAtlas(gl, FONT_NAME, FONT_SIZE);

    // create text rendering instance buffers
    const exampleText = "Hello, world!"; // TODO only example

    const numInstances = exampleText.length;

    const charPosData = new Float32Array(numInstances * 2);
    const charUVData = new Float32Array(numInstances * 2);
    const charColorData = new Float32Array(numInstances * 3);

    [...exampleText].forEach((ch, i) => { // split characters with spread for unicode safety
        const { x, y } = charMap.get(ch) ?? { x: 0, y: 0 };
        charPosData.set([10 + (i + 0.5) * charDims[0], 10 + charDims[1] / 2], i * 2);
        charUVData.set([x, y], i * 2);
        charColorData.set([1, 1, 1], i * 3); // all characters white
    });

    const charPosBuf = createInstanceBuffer(gl, charPosData);
    const charUVBuf = createInstanceBuffer(gl, charUVData);
    const charColorBuf = createInstanceBuffer(gl, charColorData);

    // render passes & pipeline
    const pipeline = new RenderPipeline(gl, texDims);
    const textPass = new RenderPass(gl, createProgram(gl, textVert, textFrag), screenDims);
    const crtPass = new RenderPass(gl, createProgram(gl, screenVert, crtFrag), texDims);
    const warpPass = new RenderPass(gl, createProgram(gl, screenVert, warpFrag), screenDims);

    // animation loop
    const render = (time: number): void => {
        void time; // TODO temporary
        pipeline.runPasses([
            {
                pass: textPass,
                uniforms: {
                    uGlyphSize: { type: "2f", value: charDims },
                    uAtlasSize: { type: "2f", value: atlasDims },
                    uResolution: { type: "2f", value: screenDims },
                    uAtlas: { type: "tex", value: { tex: atlas } }
                },
                attribs: {
                    ...geometryAttrib,
                    iCharPos: { buffer: charPosBuf, itemSize: 2, instanced: true },
                    iCharUV: { buffer: charUVBuf, itemSize: 2, instanced: true },
                    iCharColor: { buffer: charColorBuf, itemSize: 3, instanced: true }
                },
                instances: numInstances
            },
            // {
            //     pass: crtPass,
            //     uniforms: {
            //         uResolution: { type: "2f", value: texDims },
            //         uTime: { type: "1f", value: time * 0.001 }
            //     },
            //     attribs: geometryAttrib,
            //     // needsPrevPassOutput: true // TODO remove this line
            // },
            // {
            //     pass: warpPass,
            //     uniforms: {},
            //     attribs: geometryAttrib,
            // },
        ]);
        requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
};