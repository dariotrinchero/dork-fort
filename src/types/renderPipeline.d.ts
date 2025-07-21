import type RenderPass from "renderPass";

import type { Uniforms, VertexAttribs } from "types/renderPass";

export interface RenderPassData {
    pass: RenderPass;
    uniforms: Uniforms;
    attribs: VertexAttribs;
    instances?: number;
    needsPrevPassOutput?: boolean;
}

export type RenderPassSequence = RenderPassData[];