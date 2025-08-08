import type { Dimensions, Pos, RGB } from "types/global";

export interface FontAtlas {
    atlas: WebGLTexture;       // texture with grid of pre-rendered characters
    charMap: Map<string, Pos>; // map from character to pixel location on atlas
    atlasDims: Dimensions;     // dimensions of atlas
}

type UnicodeRange = [number, number];
export type GlyphSet = (string | UnicodeRange)[];

export interface CharTile {
    ch: string;
    color: RGB;
}

// size of text grid can be given by any two of the following, where the third is computed
// (1) font size, (2) grid size, (3) resolution

interface FontSize { fontSize: number; }
interface CharDims { charDims: Dimensions; }
interface Resolution { resolution: Dimensions; }
interface GridDims { gridDims: Dimensions; }

export type TextRendererSizeSpec =
    | Resolution & GridDims & { fontSize?: never } & { preserveGridDims?: boolean }
    | FontSize & Resolution & { gridDims?: never }
    | FontSize & GridDims & { resolution?: never };

export type TextSize = FontSize & CharDims;
export type TextRendererSize = TextSize & Resolution & GridDims;