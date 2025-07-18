import { createProgram } from "webgl";

import RenderPass from "renderPass";
import RenderPipeline from "renderPipeline";

// shader source code
import screenVert from "shaders/screen.vert";
import crtFrag from "shaders/crt.frag";
import warpFrag from "shaders/warp.frag";
import textFrag from "shaders/text.frag";
import textVert from "shaders/text.vert";

// determines on-screen size of CRT scanlines
const crtResMult = 0.6;

window.onload = () => {
    // canvas & rendering context
    const canvas = document.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2")!;

    // dimensions
    const screenDims: [number, number] = [canvas.width, canvas.height] = [window.innerWidth, window.innerHeight];
    const texDims: [number, number] = [Math.floor(crtResMult * screenDims[0]), Math.floor(crtResMult * screenDims[1])];

    // fullscreen quad geometry
    const fsQuad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, fsQuad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    // render passes & pipeline
    const pipeline = new RenderPipeline(gl, texDims);
    const pass1 = new RenderPass(gl, createProgram(gl, screenVert, crtFrag), fsQuad, texDims);
    const pass2 = new RenderPass(gl, createProgram(gl, screenVert, warpFrag), fsQuad, screenDims);

    // animation loop
    const render = (time: number) => {
        pipeline.runPasses([
            {
                pass: pass1,
                uniforms: {
                    uResolution: { type: "2f", value: texDims },
                    uTime: { type: "1f", value: time * 0.001 }
                },
                needsPrevPassOutput: true
            },
            {
                pass: pass2,
                uniforms: {}
            },
        ]);
        requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
};