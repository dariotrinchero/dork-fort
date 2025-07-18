type UniformType = "1f" | "2f" | "tex";

interface UniformValue<T> {
    type: UniformType;
    value: T;
}

interface UTexValue {
    tex: WebGLTexture;
    unit?: number;
}

interface U1f extends UniformValue<number> { type: "1f"; }
interface U2f extends UniformValue<[number, number]> { type: "2f"; }
interface UTex extends UniformValue<UTexValue> { type: "tex"; }

type Uniform = U1f | U2f | UTex;

export interface Uniforms {
    [name: string]: Uniform;
}