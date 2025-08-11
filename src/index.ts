import type { Dimensions } from "types/global";
import type { VertexAttribs } from "types/renderPipeline";

import { arrayBufFromData, createProgram, createTexture } from "webglHelpers";

import RenderPipeline from "renderPipeline";
import TextRenderer from "textRenderer";

// shader source code
import crtFrag from "shaders/crt.frag";
import screenVert from "shaders/screen.vert";
import warpFrag from "shaders/warp.frag";

// global constants
const FONT_NAME = "DejaVuSansMono";
const TEX_SCALE = 1.0; // global scale factor for intermediate render passes

const loadImg = async (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = url;
        img.onload = () => { resolve(img); };
        img.onerror = reject;
    });
};

window.onload = async () => {
    // canvas & rendering context
    const canvas = document.querySelector("canvas");
    if (!canvas) throw new Error("Unable to locate canvas for CRT screen");
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 is not supported");

    // dimensions
    const screenDims: Dimensions = [canvas.width, canvas.height] = [window.innerWidth, window.innerHeight];
    const texDims: Dimensions = [Math.floor(TEX_SCALE * screenDims[0]), Math.floor(TEX_SCALE * screenDims[1])];

    // fullscreen quad geometry
    const fsQuad = arrayBufFromData(gl, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]));
    const geometryAttrib: VertexAttribs = { aQuadVertPos: { buffer: fsQuad, itemSize: 2 } };

    // render passes & pipeline
    const pipeline = new RenderPipeline(gl, {
        colorFn: ([x, y]) => { // TODO temporary test gradient
            const xFrac = x / texDims[0], yFrac = y / texDims[1];
            return [
                Math.floor(xFrac * 255),
                Math.floor(yFrac * 255),
                Math.floor(255 * (1 - xFrac)),
                255,
            ];
        },
        dims: texDims,
    }, true);
    const crtProgram = createProgram(gl, screenVert, crtFrag);
    const warpProgram = createProgram(gl, screenVert, warpFrag);

    // text renderer
    const textRenderer: TextRenderer = await TextRenderer.new(gl, FONT_NAME, { gridDims: [151, 43], preserveGridDims: true, resolution: texDims }); // TODO temporary

    // TODO temporary image testing
    const blackHole = createTexture(gl, await loadImg("public/bh.jpg"));
    const { gridDims } = textRenderer.getSize();

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
        void time;
        pipeline.runPasses([
            {
                ...textRenderer.renderPass(),
                composition: { mode: "series" } // TODO comment out to draw over initial texture
            },
            {
                attribs: geometryAttrib,
                composition: { mode: "series" },
                program: crtProgram,
                uniforms: {
                    uResolution: { type: "2f", value: texDims },
                    uTime: { type: "1f", value: time * 0.003 }
                },
            },
            {
                attribs: geometryAttrib,
                composition: { mode: "series", outputDims: screenDims },
                program: warpProgram,
                uniforms: {},
            },
        ]);
        requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
};