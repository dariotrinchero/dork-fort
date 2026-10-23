/**
 * Compile-time font subsetting: reduces a font to only the glyphs in a glyph set (as used by the text renderer),
 * outputting WOFF2.
 */

import { readFile } from "fs/promises";
import subsetFont from "subset-font";

/**
 * Convert glyph set (in the shorthand used by the text renderer: a list of strings & inclusive [start, end]
 * code point ranges) into a string containing every glyph.
 *
 * @param glyphSet shorthand representation of the collection of Unicode glyphs
 * @returns string of all glyphs in set
 */
const expandGlyphSet = glyphSet => glyphSet.map(set => {
    if (typeof set === "string") return set;
    const [ start, end ] = set;
    return String.fromCodePoint(...Array.from({ length: end + 1 - start }, (_, k) => start + k));
}).join("");

let cache = { key: undefined, woff2: undefined };

/**
 * Subset font to glyphs in glyph set, reusing previous result if font & glyph set are unchanged.
 *
 * @param fontPath path to source font (TTF, WOFF, or WOFF2)
 * @param glyphSetPath path to JSON glyph set
 * @returns subsetted font, in WOFF2 format
 */
export const subsetToGlyphSet = async (fontPath, glyphSetPath) => {
    const [ font, glyphSetJson ] = await Promise.all([ readFile(fontPath), readFile(glyphSetPath, "utf8") ]);
    const key = `${font.length}:${glyphSetJson}`;
    if (cache.key !== key) {
        cache = { key, woff2: await subsetFont(font, expandGlyphSet(JSON.parse(glyphSetJson)), { targetFormat: "woff2" }) };
    }
    return cache.woff2;
};
