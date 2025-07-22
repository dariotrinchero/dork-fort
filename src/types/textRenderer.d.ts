import type { Dimensions, Pos, RGB } from "types/global";

export interface FontAtlas {
    atlas: WebGLTexture;       // texture with grid of pre-rendered characters
    charMap: Map<string, Pos>; // map from character to pixel location on atlas
    charDims: Dimensions;      // dimensions of each character
    atlasDims: Dimensions;     // dimensions of atlas
}

type UnicodeRange = [number, number];
export type GlyphSet = (string | UnicodeRange)[];

export interface CharTile {
    ch: string;
    color: RGB;
}