import type { Dimensions } from "types/global";

//-- uniforms --------------------------------------------------------------------------------------------

type UniformType = "1f" | "2f" | "tex";

interface Uniform<T> {
    type: UniformType;
    value: T;
    location?: WebGLUniformLocation; // store locations to save lookups
}

interface UTexValue {
    tex: WebGLTexture;
    unit?: number;
}

interface U1f extends Uniform<number> { type: "1f"; }
interface U2f extends Uniform<[number, number]> { type: "2f"; }
interface UTex extends Uniform<UTexValue> { type: "tex"; }

export type Uniforms = Record<string, U1f | U2f | UTex>;

//-- vertex attributes -----------------------------------------------------------------------------------

interface VertexAttrib {
    buffer: WebGLBuffer;
    itemSize: number;
    instanced?: boolean;
    type?: GLenum; // assumed to be float if omitted
    location?: number; // store locations to save lookups
}

export type VertexAttribs = Record<string, VertexAttrib>;

//-- render pass composition -----------------------------------------------------------------------------

/**
 * Passes can be composed in two 'modes':
 * 
 * 1. Series (output dimensions of each pass become input dimensions of next pass)
 *    ┏━━━━━━┓
 *    ┃      ┃             ┏━━━┓             ┏━┓
 *    ┃      ┃ -[pass 1]-> ┃   ┃ -[pass 2]-> ┃ ┃ -[pass 3]-> ...
 *    ┗━━━━━━┛             ┗━━━┛             ┗━┛
 * 
 * 2. Parallel (each pass takes same input as previous pass, & draws on same output buffer)
 *    ┏━━━━━━┓
 *    ┃      ┃ -[pass 1]-> ┏━━━┓
 *    ┃      ┃ -[pass 2]-> ┃   ┃ (results blended)
 *    ┃      ┃ -[pass 3]-> ┗━━━┛
 *    ┗━━━━━━┛
 */

interface PassCompositionBase { mode: "series" | "parallel"; }
interface SeriesPass extends PassCompositionBase {
    mode: "series";
    outputDims?: Dimensions // assume same as input if omitted
}
interface ParallelPass extends PassCompositionBase {
    mode: "parallel";
    ignoreInput?: boolean; // pass input buffer if omitted
}

export type PassComposition = SeriesPass | ParallelPass;

//-- render pass sequence --------------------------------------------------------------------------------

export interface RenderPass {
    // WebGL program & inputs
    program: WebGLProgram;
    uniforms: Uniforms;
    attribs: VertexAttribs;

    // composition with preceding pass
    composition: PassComposition;

    // number of instances (1 if omitted)
    instances?: number;
}

export type RenderPassSequence = RenderPass[];

//-- input & output buffers ------------------------------------------------------------------------------

export interface FrameBuffer {
    texture: WebGLTexture;
    dims: Dimensions;
    buffer: WebGLFramebuffer;
}