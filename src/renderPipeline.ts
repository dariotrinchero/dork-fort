import type { FrameBuffer, PassTarget, RenderPass, RenderPassSequence, Uniforms } from "types/renderPipeline";
import type { Dimensions } from "types/global";

import { createFramebuffer, createTexture } from "webglHelpers";

const INPUT_UNIFORM_NAME = "uPrevRender";
const SCREEN = -1;

export default class RenderPipeline {
    // frame buffers & per-pass assignments of input & output buffers, reused until pass structure changes
    private buffers: FrameBuffer[] = [];
    private targets: PassTarget[] = [];
    private planKey = "";

    // cache of uniform locations, per program
    private uniformLocations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

    constructor(
        private gl: WebGL2RenderingContext,
        private dims: Dimensions,
        private drawToScreen = true
    ) {
        // blend colors, but leave destination alpha opaque
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    /**
     * Set default dimensions of frame buffers; buffers are reallocated on the next run.
     *
     * @param dims new default frame buffer dimensions
     */
    public resize(dims: Dimensions): void {
        this.dims = dims;
    }

    /**
     * Get index of a frame buffer with given dimensions, other than the excluded buffer, creating one if needed.
     *
     * @param dims required dimensions of frame buffer
     * @param exclude index of buffer which may not be used (typically because it is the current input)
     * @returns index of frame buffer
     */
    private acquireBuffer(dims: Dimensions, exclude?: number): number {
        const idx = this.buffers.findIndex((buf, i) => i !== exclude && buf.dims[0] === dims[0] && buf.dims[1] === dims[1]);
        if (idx !== -1) return idx;

        const texture = createTexture(this.gl, { dims });
        const buffer = createFramebuffer(this.gl, texture);
        return this.buffers.push({ buffer, dims, texture }) - 1;
    }

    /**
     * Assign input & output frame buffers to each pass in given sequence, (re)allocating buffers only if the
     * structure of the sequence (or default dimensions) changed since the last run.
     *
     * eg. Suppose our passes are
     *  -[1. par]-> ┏━━━┓             ┏━━━┓             ┏━━━┓             ┏━┓
     *  -[2. par]-> ┃ A ┃ -[3. ser]-> ┃ A ┃ -[4. ser]-> ┃ A ┃ -[5. ser]-> ┃B┃ -[6. ser]-> (screen)
     *              ┗━━━┛             ┗━━━┛             ┗━━━┛             ┗━┛
     * where A, B denote different dimensions. We create 3 buffers of sizes [A, A, B], & record targets:
     * [
     *    { out: 0 },         // pass 1 (first pass has no input)
     *    { out: 0 },         // pass 2
     *    { in: 0, out: 1 },  // pass 3
     *    { in: 1, out: 0 },  // pass 4
     *    { in: 0, out: 2 },  // pass 5
     *    { in: 2, out: -1 }, // pass 6, -1 meaning output to screen
     * ]
     *
     * @param sequence sequence of render passes to plan
     */
    private plan(sequence: RenderPassSequence): void {
        const key = [this.dims, this.drawToScreen, ...sequence.map(({ composition }) =>
            composition.mode === "series" ? `s${composition.outputDims?.join("x") ?? ""}` : "p"
        )].join("|");
        if (key === this.planKey) return;
        this.planKey = key;

        // free old buffers
        this.buffers.forEach(({ buffer, texture }) => {
            this.gl.deleteFramebuffer(buffer);
            this.gl.deleteTexture(texture);
        });
        this.buffers = [];

        // last pass to start a new output may draw to screen (along with any parallel passes after it)
        const lastSeries = Math.max(0, sequence.findLastIndex(({ composition }) => composition.mode === "series"));

        let input: number | undefined;
        let output = SCREEN;
        this.targets = sequence.map(({ composition }, i) => {
            const startsOutput = i === 0 || composition.mode === "series";
            if (startsOutput) {
                if (i > 0) input = output;
                const inDims = input === undefined ? this.dims : this.buffers[input]?.dims ?? this.dims;
                const outDims = composition.mode === "series" ? composition.outputDims ?? inDims : inDims;
                output = this.drawToScreen && i === lastSeries ? SCREEN : this.acquireBuffer(outDims, input);
            }

            const readsInput = composition.mode === "series" || !composition.ignoreInput;
            return { clear: startsOutput, input: readsInput ? input : undefined, output };
        });
    }

    /**
     * Run given sequence of render passes, assuming that only the final pass renders directly to screen.
     *
     * @param sequence sequence of render passes to run
     */
    public runPasses(sequence: RenderPassSequence): void {
        this.plan(sequence);
        sequence.forEach((pass, i) => {
            const target = this.targets[i];
            if (target) this.draw(pass, target);
        });
    }

    /**
     * Run given render pass, drawing to given target.
     *
     * @param pass render pass to run
     * @param target input & output frame buffers of render pass
     */
    private draw({ program, uniforms, vao, instances, blend }: RenderPass, { input, output, clear }: PassTarget): void {
        const gl = this.gl;
        gl.useProgram(program);
        gl.bindVertexArray(vao);

        // render to output
        const outBuf = output === SCREEN ? undefined : this.buffers[output];
        gl.bindFramebuffer(gl.FRAMEBUFFER, outBuf?.buffer ?? null);
        gl.viewport(0, 0, ...outBuf?.dims ?? [gl.drawingBufferWidth, gl.drawingBufferHeight]);

        if (blend) gl.enable(gl.BLEND);
        else gl.disable(gl.BLEND);

        if (clear) {
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        const inTex = input === undefined ? undefined : this.buffers[input]?.texture;
        this.setUniforms(program, inTex ? { ...uniforms, [INPUT_UNIFORM_NAME]: { type: "tex", value: inTex } } : uniforms);

        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instances ?? 1);
        gl.bindVertexArray(null);
    }

    /**
     * Get location of uniform with given name in given program, caching the result.
     *
     * @param program WebGL program containing uniform
     * @param name name of uniform
     * @returns location of uniform (or null if program has no such active uniform)
     */
    private uniformLocation(program: WebGLProgram, name: string): WebGLUniformLocation | null {
        let locations = this.uniformLocations.get(program);
        if (!locations) this.uniformLocations.set(program, locations = new Map<string, WebGLUniformLocation | null>());

        let location = locations.get(name);
        if (location === undefined) locations.set(name, location = this.gl.getUniformLocation(program, name));
        return location;
    }

    /**
     * Set (or update) uniforms used by given WebGL program, binding each texture to its own texture unit.
     *
     * @param program WebGL program for which to set uniforms
     * @param uniforms uniforms needed by WebGL program
     */
    private setUniforms(program: WebGLProgram, uniforms: Uniforms): void {
        let unit = 0;
        Object.entries(uniforms).forEach(([name, uniform]) => {
            const location = this.uniformLocation(program, name);
            if (location === null) return;

            const { type, value } = uniform;
            if (type === "1f") this.gl.uniform1f(location, value);
            else if (type === "1fv") this.gl.uniform1fv(location, value);
            else if (type === "2f") this.gl.uniform2f(location, ...value);
            else { // type === "tex"
                this.gl.activeTexture(this.gl.TEXTURE0 + unit);
                this.gl.bindTexture(this.gl.TEXTURE_2D, value);
                this.gl.uniform1i(location, unit++);
            }
        });
    }
};
