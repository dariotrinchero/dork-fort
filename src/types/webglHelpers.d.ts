import type { Dimensions, Pos, RGBA } from "types/global";

export type ShaderType = WebGLRenderingContextBase["FRAGMENT_SHADER"] | WebGLRenderingContextBase["VERTEX_SHADER"];
export type MinMagFilterType = WebGLRenderingContext["NEAREST"] | WebGLRenderingContext["LINEAR"];

export interface NewTexture {
    dims: Dimensions,             // dimensions of texture to create
    colorFn?: (pos: Pos) => RGBA; // function mapping pixel coordinates to RGBA
};

export type TextureData = NewTexture | TexImageSource;