import type { Dimensions } from "types/global";
import type { Uniforms, VertexAttribs, RenderPassSequence } from "types/renderPipeline";

import { createFramebuffer, createTexture } from "webglHelpers";

export default class RenderPipeline {
    private inTex: WebGLTexture;
    private outTex: WebGLTexture;
    private inBuffer: WebGLFramebuffer;
    private outBuffer: WebGLFramebuffer;

    constructor(
        private gl: WebGL2RenderingContext,
        private textureDims: Dimensions,
        private screenDims: Dimensions
    ) {
        // TODO make blending configurable
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // TODO make initial texture configurable
        this.inTex = createTexture(gl, textureDims);
        this.outTex = createTexture(gl, textureDims,
            ([x, y]) => { // TODO temporary test gradient
                const xFrac = x / textureDims[0], yFrac = y / textureDims[1];
                return [
                    Math.floor(xFrac * 255),
                    Math.floor(yFrac * 255),
                    Math.floor(255 * (1 - xFrac)),
                    255,
                ];
            }
        );

        this.inBuffer = createFramebuffer(gl, this.inTex);
        this.outBuffer = createFramebuffer(gl, this.outTex);
    }

    /**
     * Swap input & output textures & buffers to prepare for next pass in multi-pass rendering pipeline.
     */
    private swap(): void {
        [this.inTex, this.outTex] = [this.outTex, this.inTex];
        [this.inBuffer, this.outBuffer] = [this.outBuffer, this.inBuffer];
    }

    /**
     * Run given sequence of render passes, assuming that only the final pass renders directly to screen.
     * 
     * @param sequence sequence of render passes to run
     */
    public runPasses(sequence: RenderPassSequence): void {
        sequence.forEach(({ program, uniforms, attribs, instances, prevOutputHandling }, i) => {
            // swap buffers if not drawing over previous output
            const clearOutBuffer = prevOutputHandling !== "draw over";
            if (clearOutBuffer) this.swap();

            // input previous output if needed
            prevOutputHandling ??= i !== 0 ? "input" : "discard";
            if (prevOutputHandling === "input") uniforms.uPrevRender = { type: "tex", value: { tex: this.inTex } };

            this.draw(program, uniforms, attribs, instances ?? 1, i === sequence.length - 1, clearOutBuffer);
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
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, outputToScreen ? null : this.outBuffer);
        this.gl.viewport(0, 0, ...(outputToScreen ? this.screenDims : this.textureDims));

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