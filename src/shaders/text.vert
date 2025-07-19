#version 300 es

layout(location = 0) in vec2 aPos; // quad vertex positions

// instanced attributes
layout(location = 1) in vec2 iCharPos;   // screen position of character
layout(location = 2) in vec2 iCharUV;    // UV origin of character in atlas
layout(location = 3) in vec3 iCharColor; // RGB color

uniform vec2 uGlyphSize;  // glyph size in pixels
uniform vec2 uAtlasSize;  // atlas size in pixels
uniform vec2 uResolution; // screen size in pixels

out vec2 vUV;
out vec3 vColor;

void main() {
    // convert character position from pixels to clip space
    vec2 pos = iCharPos + aPos * uGlyphSize;
    vec2 clipPos = (pos / uResolution) * 2.0 - 1.0;
    clipPos.y *= -1.0;

    vUV = (iCharUV * uGlyphSize + aPos * uGlyphSize) / uAtlasSize;
    gl_Position = vec4(clipPos, 0.0, 1.0);
    vColor = iCharColor;
}