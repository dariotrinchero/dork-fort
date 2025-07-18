import type { Uniforms } from "types/renderPass";

export default class RenderPass {
    private positionLoc: number;

    constructor(
        private gl: WebGLRenderingContext,
        private program: WebGLProgram,
        private geometry: WebGLBuffer, // assume fixed for all runs
        private dimensions: [number, number], // assume fixed for all runs
    ) {
        this.positionLoc = this.gl.getAttribLocation(program, "aPos");
    }

    private bindGeometry(): void {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.geometry);
        this.gl.enableVertexAttribArray(this.positionLoc);
        this.gl.vertexAttribPointer(this.positionLoc, 2, this.gl.FLOAT, false, 0, 0);
    }

    private setUniforms(uniforms: Uniforms): void {
        for (const name in uniforms) {
            const loc = this.gl.getUniformLocation(this.program, name);
            if (loc === null) continue;

            const uniform = uniforms[name]!;
            if (uniform.type === "1f") this.gl.uniform1f(loc, uniform.value);
            else if (uniform.type === "2f") this.gl.uniform2f(loc, ...uniform.value);
            else if (uniform.type === "tex") {
                const unit: number = uniform.value.unit || 0;
                this.gl.activeTexture(this.gl.TEXTURE0 + unit);
                this.gl.bindTexture(this.gl.TEXTURE_2D, uniform.value.tex);
                this.gl.uniform1i(loc, unit);
            }
        }
    }

    /**
     * Run the program & output render to given frame buffer.
     * 
     * @param frameBuffer target frame buffer for rendered output (or null to render to screen)
     */
    private drawTo(frameBuffer: WebGLFramebuffer | null = null) {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, frameBuffer);
        this.gl.viewport(0, 0, ...this.dimensions);
        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }

    /**
     * Run the WebGL program with given uniforms, rendering output to given frame buffer.
     * 
     * @param uniforms uniforms needed by WebGL program
     * @param prevPassOutput texture with output of previous rendering pass, if needed
     * @param frameBuffer target frame buffer for rendered output
     */
    public run(uniforms: Uniforms, prevPassOutput?: WebGLTexture, frameBuffer: WebGLFramebuffer | null = null) {
        this.gl.useProgram(this.program);
        this.bindGeometry();
        if (prevPassOutput) uniforms["uPrevRender"] = { type: "tex", value: { tex: prevPassOutput } };
        this.setUniforms(uniforms);
        this.drawTo(frameBuffer);
    }
};