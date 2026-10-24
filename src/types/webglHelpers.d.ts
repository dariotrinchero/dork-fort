import type { Dimensions, Pos, RGBA } from "types/global";

export type ShaderType = WebGL2RenderingContext["FRAGMENT_SHADER"] | WebGL2RenderingContext["VERTEX_SHADER"];
export type MinMagFilterType = WebGL2RenderingContext["NEAREST"] | WebGL2RenderingContext["LINEAR"];

export interface NewTexture {
    dims: Dimensions,             // dimensions of texture to create
    colorFn?: (pos: Pos) => RGBA; // function mapping pixel coordinates to RGBA
};

export type TextureData = NewTexture | TexImageSource;
