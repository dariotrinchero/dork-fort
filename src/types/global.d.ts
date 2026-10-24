// globally-used types

export type Pos = [number, number];
export type Dimensions = [number, number];
export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];
export type Rect = [number, number, number, number]; // left, top, right, & bottom

// run of text in a single colour, & line of text made up of such runs
export interface Segment {
    text: string;
    color: RGB;
}
export type Line = Segment[];
