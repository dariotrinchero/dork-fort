import type { Dimensions } from "types/global";
import type { VertexAttribs } from "types/renderPipeline";

import { arrayBufFromData, createProgram } from "webglHelpers";

import RenderPipeline from "renderPipeline";
import TextRenderer from "textRenderer";

// shader source code
import screenVert from "shaders/screen.vert";
import crtFrag from "shaders/crt.frag";
import warpFrag from "shaders/warp.frag";

// font
const FONT_NAME = "DejaVuSansMono";
const FONT_SIZE = 28;

// global scale factor for intermediate render passes
const TEX_SCALE = 1.0;

window.onload = async () => {
    // canvas & rendering context
    const canvas = document.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2")!;

    // dimensions
    const screenDims: Dimensions = [canvas.width, canvas.height] = [window.innerWidth, window.innerHeight];
    const texDims: Dimensions = [Math.floor(TEX_SCALE * screenDims[0]), Math.floor(TEX_SCALE * screenDims[1])];

    // fullscreen quad geometry
    const fsQuad = arrayBufFromData(gl, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]));
    const geometryAttrib: VertexAttribs = { aQuadVertPos: { buffer: fsQuad, itemSize: 2 } };

    // render passes & pipeline
    const pipeline = new RenderPipeline(gl, texDims, screenDims);
    const crtProgram = createProgram(gl, screenVert, crtFrag);
    const warpProgram = createProgram(gl, screenVert, warpFrag);

    // text renderer
    const textRenderer: TextRenderer = await TextRenderer.new(gl, FONT_NAME, FONT_SIZE, texDims);
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
    const render = (time: number): void => {
        pipeline.runPasses([
            {
                ...textRenderer.renderPassData(),
                // prevOutputHandling: "draw over" // TODO remove this line
            },
            {
                program: crtProgram,
                uniforms: {
                    uResolution: { type: "2f", value: texDims },
                    uTime: { type: "1f", value: time * 0.001 }
                },
                attribs: geometryAttrib,
                // prevOutputHandling: "input" // TODO remove this line
            },
            {
                program: warpProgram,
                uniforms: {},
                attribs: geometryAttrib,
            },
        ]);
        requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
};