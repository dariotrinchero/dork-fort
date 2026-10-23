import type { Dimensions } from "types/global";
import type { TextRendererSizeSpec } from "types/textRenderer";

import { createProgram, createQuadBuffer, createVertexArray } from "webglHelpers";

import RenderPipeline from "renderPipeline";
import TextRenderer from "textRenderer";

// shader source code
import crtFrag from "shaders/crt.frag";
import screenVert from "shaders/screen.vert";
import warpFrag from "shaders/warp.frag";

// global constants
const FONT_NAME = "DejaVuSansMono";
const TEX_SCALE = 1.0; // global scale factor for intermediate render passes
const MAX_TEX_DPR = 2; // cap on intermediate render pass pixels per CSS pixel, to limit cost on high-DPI phones
const FONT_SIZE = 16; // in CSS pixels

window.onload = async () => {
    // canvas & rendering context
    const canvas = document.querySelector("canvas");
    if (!canvas) throw new Error("Unable to locate canvas for CRT screen");
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
    if (!gl) throw new Error("WebGL2 is not supported");

    // browsers may drop WebGL context (eg. when phone puts tab in background); simplest recovery is to reload
    canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); });
    canvas.addEventListener("webglcontextrestored", () => { location.reload(); });

    /**
     * Match canvas resolution to its displayed size (in device pixels), & compute dimensions of intermediate
     * render passes. Sizes of text & CRT effects are given in CSS pixels, so that they scale with browser zoom.
     * 
     * @returns dimensions of intermediate render passes, or undefined if size is unchanged
     */
    let texDims: Dimensions = [0, 0];
    let texScale = 1; // intermediate render pass pixels per CSS pixel
    const syncSize = (): Dimensions | undefined => {
        const dpr = window.devicePixelRatio;
        const width = Math.round(canvas.clientWidth * dpr);
        const height = Math.round(canvas.clientHeight * dpr);
        const newTexScale = TEX_SCALE * Math.min(dpr, MAX_TEX_DPR);
        const newTexDims: Dimensions = [
            Math.floor(newTexScale * canvas.clientWidth),
            Math.floor(newTexScale * canvas.clientHeight),
        ];

        // browser zoom changes device pixel ratio, often without changing canvas size in device pixels
        if (width === canvas.width && height === canvas.height && newTexScale === texScale
            && newTexDims[0] === texDims[0] && newTexDims[1] === texDims[1]) return undefined;

        [canvas.width, canvas.height] = [width, height];
        texScale = newTexScale;
        return texDims = newTexDims;
    };
    syncSize();

    // fullscreen quad geometry & post-processing programs
    const fsQuad = createQuadBuffer(gl);
    const crtProgram = createProgram(gl, screenVert, crtFrag);
    const crtVAO = createVertexArray(gl, crtProgram, { aQuadVertPos: { buffer: fsQuad, itemSize: 2 } });
    const warpProgram = createProgram(gl, screenVert, warpFrag);
    const warpVAO = createVertexArray(gl, warpProgram, { aQuadVertPos: { buffer: fsQuad, itemSize: 2 } });

    // render pipeline & text renderer
    const pipeline = new RenderPipeline(gl, texDims);
    const textSize = (): TextRendererSizeSpec => ({ fontSize: Math.round(FONT_SIZE * texScale), resolution: texDims });
    const textRenderer = await TextRenderer.new(gl, FONT_NAME, textSize());

    textRenderer.print("Once upon a midnight dreary, while I pondered, weak and weary\n" +
        " Over many a quaint and curious volume of forgotten lore,\n" +
        " While I nodded, nearly napping, suddenly there came a tapping,\n" +
        " As of some one gently rapping, rapping at my chamber door.\n" +
        " \"Tis some visitor,\" I muttered, \"tapping at my chamber door —\n" +
        " Only this, and nothing more.\"\n\n" +
        "Ah, distinctly I remember it was in the bleak December,\n" +
        " And each separate dying ember wrought its ghost upon the floor.\n" +
        " Eagerly I wished the morrow; — vainly I had sought to borrow\n" +
        " From my books surcease of sorrow — sorrow for the lost Lenore —\n" +
        " For the rare and radiant maiden whom the angels name Lenore —\n" +
        " Nameless here for evermore.\n\n" +
        "And the silken sad uncertain rustling of each purple curtain\n" +
        " Thrilled me — filled me with fantastic terrors never felt before;\n" +
        " So that now, to still the beating of my heart, I stood repeating,\n" +
        " \"Tis some visitor entreating entrance at my chamber door —\n" +
        " Some late visitor entreating entrance at my chamber door; —\n" +
        " This it is, and nothing more.\"\n\n" +
        "Presently my soul grew stronger; hesitating then no longer,\n" +
        " \"Sir,\" said I, \"or Madam, truly your forgiveness I implore;\n" +
        " But the fact is I was napping, and so gently you came rapping,\n" +
        " And so faintly you came tapping, tapping at my chamber door,\n" +
        " That I scarce was sure I heard you\"— here I opened wide the door; —\n" +
        " Darkness there, and nothing more.\n\n" +
        "Deep into that darkness peering, long I stood there wondering, fearing,\n" +
        " Doubting, dreaming dreams no mortals ever dared to dream before;\n" +
        " But the silence was unbroken, and the stillness gave no token,\n" +
        " And the only word there spoken was the whispered word, \"Lenore?\"\n" +
        " This I whispered, and an echo murmured back the word, \"Lenore!\" —\n" +
        " Merely this, and nothing more.\n",
        [1, 191 / 255, 0]
    );

    // animation loop
    const render = (): void => {
        if (syncSize()) {
            pipeline.resize(texDims);
            textRenderer.resize(textSize());
        }

        pipeline.runPasses([
            textRenderer.renderPass(),
            {
                composition: { mode: "series" },
                program: crtProgram,
                uniforms: {
                    uFlicker: { type: "1f", value: Math.random() },
                    uPixelScale: { type: "1f", value: Math.max(1, Math.round(texScale)) },
                    uResolution: { type: "2f", value: texDims },
                },
                vao: crtVAO,
            },
            {
                composition: { mode: "series" },
                program: warpProgram,
                uniforms: {},
                vao: warpVAO,
            },
        ]);
        requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
};
