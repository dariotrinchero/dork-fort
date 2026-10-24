import type { Dimensions } from "types/global";

export interface TextRendererSizeSpec {
    fontSize: number;       // in whole pixels
    resolution: Dimensions; // of output, in pixels
}

export interface TextRendererSize extends TextRendererSizeSpec {
    charDims: Dimensions; // dimensions (in pixels) of rendered full Unicode box character, '█'
    gridDims: Dimensions; // columns & rows of text grid fitting within resolution (less padding)
}
