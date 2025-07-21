export interface FontAtlas {
    atlas: WebGLTexture;
    charMap: Map<string, [number, number]>;
    charDims: [number, number]; // dimensions of each character
    atlasDims: [number, number]; // dimensions of atlas
}

export type GlyphSet = (string | [number, number])[];

export type Color = [number, number, number];
export interface CharTile {
    ch: string;
    color: Color;
}