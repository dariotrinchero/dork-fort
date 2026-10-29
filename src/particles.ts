import type { Dimensions, Rect } from "types/global";
import type { RenderPass, Uniforms } from "types/renderPipeline";
import type { FontAtlas } from "types/textRenderer";
import type { ParticleEffect } from "types/particles";

import { createProgram, createQuadBuffer, createVertexArray } from "webglHelpers";

// shader source code
import embersVert from "shaders/embers.vert";
import glyphFrag from "shaders/glyph.frag";
import greetingsVert from "shaders/greetings.vert";
import motesVert from "shaders/motes.vert";
import routeFrag from "shaders/route.frag";
import routeVert from "shaders/route.vert";
import squareFrag from "shaders/square.frag";
import starsFrag from "shaders/stars.frag";
import starsVert from "shaders/stars.vert";
import symbolsVert from "shaders/symbols.vert";

const FADE_IN_TIME = 1.5; // duration (in seconds) of fade in on showing a destination, as for its sound
const FADE_OUT_TIME = 0.5; // duration (in seconds) of fade out on leaving it
const MAX_PARTICLES = 400; // most particles of any effect, each with its own seed

// particle effect: shaders computing each particle from its seed & time alone (so that it needs no simulation), &
// how many particles cover output: either particles per million square pixels of font (so that density matches size
// of text), or a fixed number
type Effect = ({ density: number } | { count: number }) & {
    vert: string;
    frag: string;
    strings?: string[]; // strings drawn from font atlas (see glyphs.glsl), as characters of particles
};

// greetings typed out by companion, at most 8 characters each (see greetings.vert)
const GREETINGS = [
    "hi!", "hello", "hey", "yo", "o/", "\\o/", ":)", "<3", "howdy", "hiya", "haai", ":::;)", "g'day", "}:)", "(^. .^)~",
    "aweh", "howzit", "molo", "cheep!", "bok bok",
];

const EFFECTS: Record<ParticleEffect, Effect> = {
    embers: { density: 70, frag: squareFrag, vert: embersVert },
    // 3 greetings, each of 8 characters & a cursor (which is its first string)
    greetings: { count: 3 * (8 + 1), frag: glyphFrag, strings: ["█", ...GREETINGS], vert: greetingsVert },
    motes: { density: 180, frag: squareFrag, vert: motesVert },
    // 2 routes, each of 2 markers & lit pixels of line (3 per 14 of at most 720; see route.vert)
    route: { count: 2 * (2 + Math.ceil(720 * 3 / 14)), frag: routeFrag, vert: routeVert },
    stars: { density: 250, frag: starsFrag, vert: starsVert },
    symbols: { density: 24, frag: glyphFrag, strings: "Φ Ψ Ω Σ Δ Θ Λ Ξ π λ φ ∂ ∫ ∑ ∏ √ ∞ △ ▽ ◊ ◌ □ ✧ ⟨ ⟩ ⁒ ⁊".split(" "),
        vert: symbolsVert },
};
const MAX_GLYPHS = 2 * 96; // most characters of strings of an effect, each padded to longest, matching glyphs.glsl

// font atlas from which effects draw characters, with size of each character cell (in pixels)
export interface ParticleFont {
    atlas: FontAtlas;
    charDims: Dimensions;
}

// whether user prefers reduced motion, in which case particles hold still
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * Ease in & out of fade.
 *
 * @param t linear progress of fade, in [0, 1]
 * @returns eased progress of fade, in [0, 1]
 */
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export default class Particles {
    private programs = new Map<ParticleEffect, { program: WebGLProgram; vao: WebGLVertexArrayObject }>();
    private effect?: ParticleEffect; // effect drawn (or fading out), if any
    private fade = 0; // linear progress of fade in of effect, in [0, 1]
    private avoid: Rect = [0, 0, 0, 0]; // region kept clear of particles (eg. icon of destination shown)
    private text: Rect = [0, 0, 0, 0]; // region where text is shown, kept clear by some effects
    private glyphs?: { atlas: FontAtlas; positions: Float32Array; stride: number; strings: string[] }; // see
                                                                                                    // glyphUniforms()

    constructor(private gl: WebGL2RenderingContext) {
        // random seeds of particles, in [0, 1)
        const seeds = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, seeds);
        gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from({ length: 4 * MAX_PARTICLES }, Math.random), gl.STATIC_DRAW);

        const quad = createQuadBuffer(gl);
        (Object.entries(EFFECTS) as [ParticleEffect, Effect][]).forEach(([name, { frag, vert }]) => {
            const program = createProgram(gl, vert, frag);
            const vao = createVertexArray(gl, program, {
                aQuadVertPos: { buffer: quad, itemSize: 2 },
                iSeed: { buffer: seeds, instanced: true, itemSize: 4 },
            });
            this.programs.set(name, { program, vao });
        });
    }

    /**
     * Fade in given effect, fading out any other first.
     *
     * @param dt time (in seconds) since last update
     * @param effect effect to show (or undefined to fade out)
     * @param avoid region to keep clear of particles, in pixels from top-left of output (or undefined to keep the
     * last one)
     * @param text region where text is shown, in pixels from top-left of output, kept clear by some effects
     */
    public update(dt: number, effect?: ParticleEffect, avoid?: Rect, text?: Rect): void {
        if (avoid) this.avoid = avoid;
        if (text) this.text = text;
        if (effect !== undefined && effect === this.effect) this.fade = Math.min(1, this.fade + dt / FADE_IN_TIME);
        else {
            this.fade = Math.max(0, this.fade - dt / FADE_OUT_TIME);
            if (this.fade === 0) this.effect = effect;
        }
    }

    /**
     * Get render pass drawing particles of effect shown (as one instanced quad per particle).
     *
     * @param resolution dimensions of output, in pixels
     * @param fontPixel pixels of output per pixel of font, to whose grid particles snap
     * @param time time (in seconds), driving particles' motion
     * @param font font atlas, for effects drawing characters (which are not drawn until it is given)
     * @returns render pass drawing particles (or undefined if none are shown)
     */
    public renderPass(resolution: Dimensions, fontPixel: number, time: number, font?: ParticleFont):
        RenderPass | undefined {
        const effect = this.effect;
        const entry = effect === undefined ? undefined : this.programs.get(effect);
        if (effect === undefined || !entry || this.fade === 0) return undefined;
        const spec = EFFECTS[effect];
        const glyphUniforms = spec.strings === undefined ? {} : font && this.glyphUniforms(spec.strings, font);
        if (!glyphUniforms) return undefined;

        const area = resolution[0] * resolution[1] / fontPixel ** 2;
        const count = "count" in spec ? spec.count : Math.round(spec.density * area / 1e6);
        return {
            blend: true,
            composition: { ignoreInput: true, mode: "parallel" },
            instances: Math.min(MAX_PARTICLES, count),
            program: entry.program,
            uniforms: {
                ...glyphUniforms,
                uAvoid: { type: "4f", value: this.avoid },
                uFontPixel: { type: "1f", value: fontPixel },
                uIntensity: { type: "1f", value: smoothstep(this.fade) },
                uResolution: { type: "2f", value: resolution },
                uText: { type: "4f", value: this.text },
                uTime: { type: "1f", value: reducedMotion.matches ? 0 : time },
            },
            vao: entry.vao,
        };
    }

    /**
     * Get uniforms locating characters of given strings on font atlas (each string padded to the longest, & packed 2
     * characters per vector; see glyphs.glsl), recomputing their positions only when strings or atlas change (as
     * atlas does with font size).
     *
     * @param strings strings drawn by effect
     * @param font font atlas, & size of each character cell
     * @returns uniforms needed by effects drawing characters
     */
    private glyphUniforms(strings: string[], { atlas, charDims }: ParticleFont): Uniforms {
        if (this.glyphs?.atlas !== atlas || this.glyphs.strings !== strings) {
            const split = strings.map(str => Array.from(segmenter.segment(str), ({ segment }) => segment));
            const stride = Math.max(1, ...split.map(chars => chars.length));
            const fitting = split.slice(0, Math.floor(MAX_GLYPHS / stride));
            const positions = new Float32Array(2 * MAX_GLYPHS).fill(-1);
            fitting.forEach((chars, i) => {
                chars.forEach((ch, k) => { positions.set(atlas.charMap.get(ch) ?? [-1, -1], 2 * (i * stride + k)); });
            });
            this.glyphs = { atlas, positions, stride, strings };
        }
        return {
            uAtlas: { type: "tex", value: atlas.atlas },
            uAtlasSize: { type: "2f", value: atlas.atlasDims },
            uGlyphSize: { type: "2f", value: charDims },
            uGlyphs: { type: "4fv", value: this.glyphs.positions },
            uStride: { type: "1f", value: this.glyphs.stride },
            uStringCount: { type: "1f", value: Math.min(strings.length, Math.floor(MAX_GLYPHS / this.glyphs.stride)) },
        };
    }
}
