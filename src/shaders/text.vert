#version 300 es

uniform vec2 uGlyphSize;  // glyph size in pixels
uniform vec2 uAtlasSize;  // atlas size in pixels
uniform vec2 uResolution; // screen size in pixels

layout(location = 0) in vec2 aQuadVertPos;   // quad vertex positions

// instanced attributes
layout(location = 1) in vec2 iCharScreenPos; // screen position of character's top-left corner (in pixels)
layout(location = 2) in vec2 iCharAtlasPos;  // atlas position of character's top-left corner (in pixels)
layout(location = 3) in vec3 iCharColor;     // RGB color

out vec2 vUV;
out vec3 vColor;

void main() {
    // offset (in pixels) of quad vertex from character's top-left corner
    vec2 offset = (aQuadVertPos + 1.0) * 0.5 * uGlyphSize;

    // convert character position from pixels to clip space
    vec2 clipPos = ((iCharScreenPos + offset) / uResolution) * 2.0 - 1.0;
    clipPos.y *= -1.0;
    gl_Position = vec4(clipPos, 0.0, 1.0);

    vUV = (iCharAtlasPos + offset) / uAtlasSize;

    vColor = iCharColor;
}