import { RenderPassSequence } from "types/renderPipeline";

import { createFramebuffer, createTexture } from "webglHelpers";

export default class RenderPipeline {
    private inTex: WebGLTexture;
    private outTex: WebGLTexture;
    private inBuffer: WebGLFramebuffer;
    private outBuffer: WebGLFramebuffer;

    constructor(public gl: WebGLRenderingContext, textureDimensions: [number, number]) {
        this.inTex = createTexture(gl, ...textureDimensions, true); // TODO temp
        this.outTex = createTexture(gl, ...textureDimensions);
        this.inBuffer = createFramebuffer(gl, this.inTex);
        this.outBuffer = createFramebuffer(gl, this.outTex);
    }

    /**
     * Swap input & output textures & buffers to prepare for next pass in multi-pass rendering pipeline.
     */
    private swap() {
        [this.inTex, this.outTex] = [this.outTex, this.inTex];
        [this.inBuffer, this.outBuffer] = [this.outBuffer, this.inBuffer];
    }

    /**
     * Run given sequence of render passes, assuming that only the final pass renders directly to screen.
     * Whenever unspecified, assume that all but the first pass operate on the output of the previous pass.
     * 
     * @param sequence sequence of render passes to run
     */
    public runPasses(sequence: RenderPassSequence) {
        sequence.forEach(({ pass, uniforms, attribs, instances, needsPrevPassOutput }, i) => {
            const prevPass = needsPrevPassOutput ?? i !== 0;
            const outBuffer = i === sequence.length - 1 ? null : this.outBuffer;
            pass.run(uniforms, attribs, instances ?? 1, prevPass ? this.inTex : undefined, outBuffer);
            this.swap();
        });
    }
};