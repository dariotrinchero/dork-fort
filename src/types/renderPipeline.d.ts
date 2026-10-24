import type { Dimensions } from "types/global";

//-- uniforms --------------------------------------------------------------------------------------------

type UniformType = "1f" | "1fv" | "2f" | "3f" | "tex";

interface Uniform<T> {
    type: UniformType;
    value: T;
}

interface U1f extends Uniform<number> { type: "1f"; }
interface U1fv extends Uniform<Float32List> { type: "1fv"; } // float array
interface U2f extends Uniform<[number, number]> { type: "2f"; }
interface U3f extends Uniform<[number, number, number]> { type: "3f"; }
interface UTex extends Uniform<WebGLTexture> { type: "tex"; } // texture units are assigned automatically

export type Uniforms = Record<string, U1f | U1fv | U2f | U3f | UTex>;

//-- vertex attributes -----------------------------------------------------------------------------------

interface VertexAttrib {
    buffer: WebGLBuffer;
    itemSize: number;
    instanced?: boolean;
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
 *
 * The first pass in a sequence has no input, & always starts a fresh (cleared) output buffer.
 */

interface PassCompositionBase { mode: "series" | "parallel"; }
interface SeriesPass extends PassCompositionBase {
    mode: "series";
    outputDims?: Dimensions // assume same as input if omitted; ignored when drawing to screen
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
    vao: WebGLVertexArrayObject; // vertex attributes, as bound by createVertexArray()

    // composition with preceding pass
    composition: PassComposition;

    // number of instances (1 if omitted)
    instances?: number;

    // whether to alpha-blend onto output buffer (false if omitted)
    blend?: boolean;
}
