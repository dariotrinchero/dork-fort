import type { Uniforms, VertexAttribs } from "types/renderPass";

export default class RenderPass {

    constructor(
        private gl: WebGL2RenderingContext,
        private program: WebGLProgram,
        private dimensions: [number, number], // assume fixed for all runs
    ) {}

    /**
     * Set (or update) the uniforms used by this WebGL program.
     * 
     * @param uniforms uniforms needed by WebGL program
     */
    private setUniforms(uniforms: Uniforms): void {
        for (const name in uniforms) {
            const loc = this.gl.getUniformLocation(this.program, name);
            if (loc === -1) continue;

            const { type, value } = uniforms[name]!;
            if (type === "1f") this.gl.uniform1f(loc, value);
            else if (type === "2f") this.gl.uniform2f(loc, ...value);
            else if (type === "tex") {
                const unit: number = value.unit || 0;
                this.gl.activeTexture(this.gl.TEXTURE0 + unit);
                this.gl.bindTexture(this.gl.TEXTURE_2D, value.tex);
                this.gl.uniform1i(loc, unit);
            }
        }
    }

    /**
     * TODO Also consider merging bindGeometry() with this.
     * 
     * @param attribs 
     */
    private setVertexAttribs(attribs: VertexAttribs): void {
        for (const name in attribs) {
            const { buffer, size, type, instanced } = attribs[name]!;
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);

            const loc = this.gl.getAttribLocation(this.program, name);
            if (loc === -1) continue;

            this.gl.enableVertexAttribArray(loc);
            this.gl.vertexAttribPointer(loc, size, type ?? this.gl.FLOAT, false, 0, 0);
            if (instanced) this.gl.vertexAttribDivisor(loc, 1);
        }
    }

    /**
     * Run the program & output render to given frame buffer.
     * 
     * @param frameBuffer target frame buffer for rendered output (or null to render to screen)
     * @param instances number of instances to draw
     */
    private drawTo(frameBuffer: WebGLFramebuffer | null = null, instances: number): void {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, frameBuffer);
        this.gl.viewport(0, 0, ...this.dimensions);
        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArraysInstanced(this.gl.TRIANGLES, 0, 6, instances);
    }

    /**
     * Run WebGL program with given vertex attributes & uniforms, rendering output to given frame buffer.
     * 
     * @param uniforms uniforms needed by WebGL program
     * @param attribs vertex attributes needed by WebGL program
     * @param instances number of instances to draw
     * @param prevPassOutput texture with output of previous rendering pass, if needed
     * @param frameBuffer target frame buffer for rendered output
     */
    public run(
        uniforms: Uniforms,
        attribs: VertexAttribs,
        instances: number,
        prevPassOutput?: WebGLTexture,
        frameBuffer: WebGLFramebuffer | null = null
    ): void {
        this.gl.useProgram(this.program);
        this.setVertexAttribs(attribs);
        if (prevPassOutput) uniforms.uPrevRender = { type: "tex", value: { tex: prevPassOutput } };
        this.setUniforms(uniforms);
        this.drawTo(frameBuffer, instances);
    }
};