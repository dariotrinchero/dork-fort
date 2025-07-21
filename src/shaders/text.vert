#version 300 es

uniform vec2 uGlyphSize;  // glyph size in pixels
uniform vec2 uAtlasSize;  // atlas size in pixels
uniform vec2 uResolution; // screen size in pixels

layout(location = 0) in vec2 aPos; // quad vertex positions

// instanced attributes
layout(location = 1) in vec2 iCharScreenPos; // screen position of character
layout(location = 2) in vec2 iCharAtlasPos;  // atlas location of character (in pixels)
layout(location = 3) in vec3 iCharColor;     // RGB color

out vec2 vUV;
out vec3 vColor;

void main() {
    // convert character position from pixels to clip space
    vec2 pos = iCharScreenPos + aPos * uGlyphSize * 0.5;
    vec2 clipPos = (pos / uResolution) * 2.0 - 1.0;
    clipPos.y *= -1.0;
    gl_Position = vec4(clipPos, 0.0, 1.0);

    vec2 uvOffset = aPos * uGlyphSize * 0.5;
    vUV = (iCharAtlasPos + uvOffset) / uAtlasSize;

    vColor = iCharColor;
}