// shared by vertex shaders of particle effects drawing strings of characters from font atlas (see particles.ts);
// include after particles.glsl

// (constants rather than macros, as minifying shaders joins lines, ending macros early; see build.js)
const int MAX_GLYPH_PAIRS = 96; // most characters (over all strings, each padded to uStride) is twice this
const int MAX_STRING = 16;      // longest string
uniform vec2 uAtlasSize;    // font atlas size in pixels
uniform vec2 uGlyphSize;    // size of character cell in pixels
uniform float uStringCount; // strings drawn
uniform float uStride;      // characters per string, including padding
uniform vec4 uGlyphs[MAX_GLYPH_PAIRS]; // top-left corner on font atlas of each character of each string, in pixels,
                                       // 2 per vector (x, y, x, y); strings are padded with (-1, -1)

// top-left corner on font atlas of given character of given string, in pixels (negative if past end of string)
vec2 glyphAt(int string, int k) {
    int i = string * int(uStride) + k;
    vec4 pair = uGlyphs[i / 2];
    return i % 2 == 0 ? pair.xy : pair.zw;
}

// number of characters in given string
int stringLength(int string) {
    int chars = 0;
    for (int k = 0; k < MAX_STRING; k++) {
        if (k >= int(uStride) || glyphAt(string, k).x < 0.0) break;
        chars++;
    }
    return chars;
}

// texture coordinates of vertex of quad drawing character with given top-left corner on font atlas
vec2 glyphUV(vec2 atlasPos) {
    return (atlasPos + (aQuadVertPos + 1.0) * 0.5 * uGlyphSize) / uAtlasSize;
}
