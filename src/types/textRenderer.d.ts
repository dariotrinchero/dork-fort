import type { Dimensions, Pos } from "types/global";

export interface TextRendererSizeSpec {
    fontSize: number;       // in whole pixels
    resolution: Dimensions; // of output, in pixels
}

export interface TextRendererSize extends TextRendererSizeSpec {
    charDims: Dimensions; // dimensions (in pixels) of rendered full Unicode box character, '█'
    gridDims: Dimensions; // columns & rows of text grid fitting within resolution (less padding)
}

// texture with grid of pre-rendered characters, & where each lies on it
export interface FontAtlas {
    atlas: WebGLTexture;       // texture with grid of pre-rendered characters
    charMap: Map<string, Pos>; // map from character to pixel location on atlas
    atlasDims: Dimensions;     // dimensions of atlas
}
