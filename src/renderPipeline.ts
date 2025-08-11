import type { FrameBuffer, RenderPassSequence, Uniforms, VertexAttribs } from "types/renderPipeline";
import type { NewTexture } from "types/webglHelpers";

import { createFramebuffer, createTexture } from "webglHelpers";

const INPUT_UNIFORM_NAME = "uPrevRender";

export default class RenderPipeline {
    // input & output frame buffers
    private input!: FrameBuffer;
    private output!: FrameBuffer;

    constructor(
        private gl: WebGL2RenderingContext,
        private initTexData: NewTexture,
        private drawToScreen?: boolean
    ) {
        // TODO make blending configurable
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    /**
     * Swap input & output frame buffers.
     */
    private swap(): void { [this.input, this.output] = [this.output, this.input]; }

    /**
     * Construct & return frame buffer (with associated texture & dimension data) from given initialization data.
     * 
     * @param newTexData data about new texture including dimensions & optional initialization function
     * @returns newly-created frame buffer
     */
    private createFrameBuffer(newTexData: NewTexture): FrameBuffer {
        const texture = createTexture(this.gl, newTexData);
        const buffer = createFramebuffer(this.gl, texture);
        return { buffer, dims: newTexData.dims, texture };
    }

    /**
     * Reassign initial dimensions & textures to frame buffers to reset pipeline for next run.
     * 
     * @param firstParallel whether first pass in pipeline is in "parallel" composition mode
     */
    private initializeBuffers(firstParallel?: boolean): void {
        this.input = this.createFrameBuffer(this.initTexData);
        this.output = this.createFrameBuffer({ dims: this.initTexData.dims });
        if (firstParallel) this.swap(); // if 1st pass is parallel, init tex should be in output
    }

    /**
     * Run given sequence of render passes, assuming that only the final pass renders directly to screen.
     * 
     * @param sequence sequence of render passes to run
     */
    public runPasses(sequence: RenderPassSequence): void {
        /**
         * TODO: Having to reinitialize buffers every single frame is probably quite slow. Here's a better idea:
         * 
         * When constructing RenderPipeline, provide some information about passes up-front — this can be missing uniforms,
         * attributes, etc, but should include at least composition modes & output dimensions. While constructing, we walk
         * through this list & create all necessary framebuffers in a list. We also record, for each pass, the indices (into
         * this list of buffers) of the input & output for that pass. Then we can simply reuse this list of buffers for every
         * pass in every Pipeline run, never having to rebuild it. (This assumes that buffer dimensions are constant in time.)
         * 
         * eg. Suppose our passes are
         * ┏━━━━━━┓
         * ┃      ┃ -[1. ser]-> ┏━━━┓             ┏━━━┓             ┏━━━┓             ┏━┓
         * ┃  A   ┃ -[2. par]-> ┃ B ┃ -[3. ser]-> ┃ B ┃ -[4. ser]-> ┃ B ┃ -[5. ser]-> ┃C┃ -[6. ser]-> (screen)
         * ┃      ┃             ┗━━━┛             ┗━━━┛             ┗━━━┛             ┗━┛
         * ┗━━━━━━┛
         * where A, B, C denote different dimensions. We create 4 buffers of sizes [A, B, B, C], & record indices:
         * [
         *    { in: 0, out: 1 },  // pass 1
         *    { in: 0, out: 1 },  // pass 2
         *    { in: 1, out: 2 },  // pass 3
         *    { in: 2, out: 1 },  // pass 4
         *    { in: 1, out: 3 },  // pass 5
         *    { in: 3, out: -1 }, // pass 6, -1 meaning output to screen
         * ]
         */
        this.initializeBuffers(sequence[0]?.composition.mode !== "series");

        // final series pass may have to output to screen
        const finalOutput = Math.max(0, sequence.findLastIndex(({ composition }) => composition.mode === "series"));

        sequence.forEach(({ program, uniforms, attribs, instances, composition }, i) => {
            const inSeries = composition.mode === "series";

            if (inSeries) {
                this.swap();

                // resize output frame buffer if needed
                const reqOutDims = composition.outputDims ?? this.output.dims;
                if (reqOutDims[0] !== this.output.dims[0] || reqOutDims[1] !== this.output.dims[1]) {
                    this.output = this.createFrameBuffer({ dims: reqOutDims });
                }
            }

            // input previous output if needed
            if (inSeries || !composition.ignoreInput) {
                uniforms[INPUT_UNIFORM_NAME] = { type: "tex", value: { tex: this.input.texture } };
            }

            this.draw(program, uniforms, attribs, instances ?? 1, this.drawToScreen && i === finalOutput, inSeries);
        });
    }

    /**
     * Run given WebGL program with given vertex attributes & uniforms.
     * 
     * @param program WebGL program to run
     * @param uniforms uniforms needed by WebGL program
     * @param attribs vertex attributes needed by WebGL program
     * @param instances number of instances to draw
     * @param outputToScreen render directly to screen instead of usual output buffer
     * @param clearBuffer whether to clear output buffer before rendering on it
     */
    private draw(
        program: WebGLProgram,
        uniforms: Uniforms,
        attribs: VertexAttribs,
        instances: number,
        outputToScreen?: boolean,
        clearBuffer = true
    ): void {
        // set uniforms & attributes
        this.gl.useProgram(program);
        this.setVertexAttribs(program, attribs);
        this.setUniforms(program, uniforms);

        // render to output
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, outputToScreen ? null : this.output.buffer);
        this.gl.viewport(0, 0, ...this.output.dims);

        if (clearBuffer) {
            this.gl.clearColor(0, 0, 0, 1);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        }

        this.gl.drawArraysInstanced(this.gl.TRIANGLES, 0, 6, instances);
    }

    /**
     * Set (or update) uniforms used by given WebGL program.
     * 
     * @param program WebGL program for which to set uniforms
     * @param uniforms uniforms needed by WebGL program
     */
    private setUniforms(program: WebGLProgram, uniforms: Uniforms): void {
        Object.entries(uniforms).forEach(([name, uniform]) => {
            // store location in uniform if absent
            if (uniform.location === undefined) {
                uniform.location = this.gl.getUniformLocation(program, name) ?? undefined;
                if (uniform.location === undefined) return;
            }

            const { location, type, value } = uniform;
            if (type === "1f") this.gl.uniform1f(location, value);
            else if (type === "2f") this.gl.uniform2f(location, ...value);
            else { // type === "tex"
                const unit: number = value.unit ?? 0;
                this.gl.activeTexture(this.gl.TEXTURE0 + unit);
                this.gl.bindTexture(this.gl.TEXTURE_2D, value.tex);
                this.gl.uniform1i(location, unit);
            }
        });
    }

    /**
     * Set (or update) vertex attributes used by given WebGL program.
     * 
     * @param program WebGL program for which to set uniforms
     * @param attribs vertex attributes needed by WebGL program
     */
    private setVertexAttribs(program: WebGLProgram, attribs: VertexAttribs): void {
        Object.entries(attribs).forEach(([name, attrib]) => {
            // store location in attrib if absent
            if (attrib.location === undefined || attrib.location === -1) {
                attrib.location = this.gl.getAttribLocation(program, name);
                if (attrib.location === -1) return;
            }

            const { buffer, itemSize, type, instanced, location } = attrib;
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
            this.gl.enableVertexAttribArray(location);
            this.gl.vertexAttribPointer(location, itemSize, type ?? this.gl.FLOAT, false, 0, 0);
            if (instanced) this.gl.vertexAttribDivisor(location, 1);
        });
    }
};