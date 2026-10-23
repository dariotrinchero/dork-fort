import type { Dimensions } from "types/global";

import { createProgram, createQuadBuffer, createVertexArray } from "webglHelpers";

import QRRenderer from "qrRenderer";
import RenderPipeline from "renderPipeline";

// QR code module data (baked from SVG at compile time)
import qrData from "assets/qr.svg";

// shader source code
import crtFrag from "shaders/crt.frag";
import screenVert from "shaders/screen.vert";
import warpFrag from "shaders/warp.frag";

// global constants
const TEX_SCALE = 1.0; // global scale factor for intermediate render passes
const MAX_TEX_DPR = 2; // cap on intermediate render pass pixels per CSS pixel, to limit cost on high-DPI phones

window.onload = () => {
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
     * render passes. Sizes of CRT effects are given in CSS pixels, so that they scale with browser zoom.
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

    // render pipeline & QR code
    const pipeline = new RenderPipeline(gl, texDims);
    const qrRenderer = new QRRenderer(gl, qrData, texDims, 0.8); // slightly darken background

    // animation loop
    const render = (): void => {
        if (syncSize()) {
            pipeline.resize(texDims);
            qrRenderer.resize(texDims);
        }

        pipeline.runPasses([
            qrRenderer.renderPass(),
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
