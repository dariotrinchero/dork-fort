import type { Dimensions, RGB } from "types/global";
import type { TextRendererSizeSpec } from "types/textRenderer";

import { createProgram, createQuadBuffer, createVertexArray } from "webglHelpers";
import { openWindowKey, setWindowColors, setWindowMetrics } from "window";
import { crtUniforms } from "crt";
import { parseHex } from "palette";
import { warpUniforms } from "warp";

import Ambience from "ambience";
import DESTINATIONS from "destinations";
import QRMenu from "menu";
import QRRenderer from "qrRenderer";
import RenderPipeline from "renderPipeline";
import Terminal from "terminal";
import TextRenderer from "textRenderer";

// QR code module data (baked from SVG at compile time)
import qrData from "assets/qr.svg";

// shader source code
import crtFrag from "shaders/crt.frag";
import screenVert from "shaders/screen.vert";
import warpFrag from "shaders/warp.frag";

// global constants
const TEX_SCALE = 1.0; // global scale factor for intermediate render passes
const MAX_TEX_DPR = 2; // cap on intermediate render pass pixels per CSS pixel, to limit cost on high-DPI phones
const FONT_NAME = "DepartureMono";
const FONT_SIZE = 22; // largest font size, in CSS pixels
const FONT_GRID = 11; // font is drawn on an 11px grid
const MIN_FONT_PIXEL = 2; // fewest intermediate render pass pixels per pixel of font (each covering one period of
                          // subpixel mask & one scanline; see crt.frag)
const BG_BRIGHTNESS = 0.8; // multiplier for background colour of QR code (slightly darkening it)
const MAX_FRAME_TIME = 0.1; // cap (in seconds) on animation time step, eg. after tab was in background

window.onload = () => {
    // canvas & rendering context
    const canvas = document.querySelector("canvas");
    if (!canvas) throw new Error("Unable to locate canvas for CRT screen");
    const input = document.querySelector<HTMLInputElement>("#prompt");
    if (!input) throw new Error("Unable to locate input for prompt");
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
    if (!gl) throw new Error("WebGL2 is not supported");

    // browsers may drop WebGL context (eg. when phone puts tab in background); simplest recovery is to reload
    canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); });
    canvas.addEventListener("webglcontextrestored", () => { location.reload(); });

    let texDims: Dimensions = [0, 0];
    let texScale = 1; // intermediate render pass pixels per CSS pixel

    /**
     * Match canvas resolution to its displayed size (in device pixels), & compute dimensions of intermediate
     * render passes. Sizes of text & CRT effects are given in CSS pixels, so that they scale with browser zoom.
     * 
     * @returns dimensions of intermediate render passes, or undefined if size is unchanged
     */
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

    // render pipeline, QR code, interactive menu, & terminal
    const pipeline = new RenderPipeline(gl, texDims);
    const qrRenderer = new QRRenderer(gl, qrData, texDims, {
        bgBrightness: BG_BRIGHTNESS,
        regions: DESTINATIONS,
    });
    setWindowColors(parseHex(qrData.background).map(c => c * BG_BRIGHTNESS / 255) as RGB);
    setWindowMetrics();
    const menu = new QRMenu(canvas, qrRenderer, DESTINATIONS.length);
    const ambience = new Ambience(); // sound of destination shown, faded in & out with it
    menu.onOpen = index => { ambience.play(index === undefined ? undefined : DESTINATIONS[index]?.sound); };
    menu.onClose = () => { ambience.stop(); };
    const terminal = new Terminal(canvas, input, menu);

    // text renderer for terminal becomes available once font loads (QR code renders in the meantime)
    let textRenderer: TextRenderer | undefined;
    let fontPixel = MIN_FONT_PIXEL; // intermediate render pass pixels per pixel of font (see textSize())
    const textSize = (): TextRendererSizeSpec => {
        // largest font size with a whole number of pixels per pixel of font, divisible by 2 or 3 (to fit subpixel
        // mask), at most FONT_SIZE, & where possible small enough for suggested commands to fit on one line below QR
        // code
        const [left, , right] = qrRenderer.contentRect();
        const fitSize = TextRenderer.fitFontSize(FONT_NAME, right - left, terminal.maxLineLength());
        const maxPixel = Math.max(MIN_FONT_PIXEL, Math.floor(FONT_SIZE * texScale / FONT_GRID));
        fontPixel = Math.max(MIN_FONT_PIXEL, Math.min(maxPixel, Math.floor(fitSize / FONT_GRID)));
        if (fontPixel % 2 !== 0 && fontPixel % 3 !== 0) fontPixel--;
        return { fontSize: FONT_GRID * fontPixel, resolution: texDims };
    };
    TextRenderer.new(gl, FONT_NAME, textSize())
        .then(text => {
            text.resize(textSize()); // in case of resize while font was loading
            textRenderer = text;
            terminal.setTextRenderer(text);
        })
        .catch((e: unknown) => { console.error("Unable to create text renderer:", e); });

    // animation loop
    let lastTime: number | undefined;
    let textDrawn = false; // whether last frame drawn included text, so that it can be kept while paused
    const render = (time: number): void => {
        const dt = Math.min(MAX_FRAME_TIME, (time - (lastTime ?? time)) / 1000);
        lastTime = time;
        requestAnimationFrame(render);

        // while a window is open, pause rendering at once (canvas keeps its last frame, & animations behind window
        // resume once it closes), provided text has been drawn, except to redraw at new size
        const resized = syncSize();
        if (resized) {
            pipeline.resize(texDims);
            qrRenderer.resize(texDims);
            textRenderer?.resize(textSize());
            setWindowMetrics();
        }
        if (openWindowKey() !== undefined && textDrawn && !resized) return;
        textDrawn = textRenderer !== undefined;
        menu.update(dt);
        terminal.update(dt, time / 1000);

        pipeline.runPasses([
            qrRenderer.renderPass(),
            ...textRenderer ? [textRenderer.renderPass()] : [],
            {
                composition: { mode: "series" },
                program: crtProgram,
                uniforms: {
                    ...crtUniforms(),
                    uFlicker: { type: "1f", value: Math.random() },
                    uFontPixel: { type: "1f", value: fontPixel },
                    uResolution: { type: "2f", value: texDims },
                },
                vao: crtVAO,
            },
            {
                composition: { mode: "series" },
                program: warpProgram,
                uniforms: warpUniforms(),
                vao: warpVAO,
            },
        ]);
    };
    requestAnimationFrame(render);
};