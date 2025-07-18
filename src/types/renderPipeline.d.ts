import type RenderPass from "renderPass";
import type { Uniforms } from "types/renderPass";

export type RenderPassSequence = {
    pass: RenderPass;
    uniforms: Uniforms;
    needsPrevPassOutput?: boolean;
}[];