// uniforms

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

export interface Uniforms {
    [name: string]: U1f | U2f | UTex;
}

// vertex attributes

interface VertexAttrib {
    buffer: WebGLBuffer;
    itemSize: number;
    instanced?: boolean;
    type?: GLenum; // assumed to be float if omitted
    location?: number; // store locations to save lookups
}

export interface VertexAttribs {
    [name: string]: VertexAttrib;
}