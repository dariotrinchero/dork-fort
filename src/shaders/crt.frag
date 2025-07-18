#version 300 es
precision mediump float;

uniform float uTime;           // animation time
uniform vec2 uResolution;      // render output size in pixels
uniform sampler2D uPrevRender; // result of previous render pass (to apply CRT effect to)

in vec2 vUV;
out vec4 fragColor;

// parameters
const float SCANLINE_WIDTH = 3.0;
const float SCANLINE_HEIGHT = 3.0;
const float BRIGHTNESS = 0.5;
const int SEPARATION_PIXELS = 2;
const float FLICKER_MAGNITUDE = 0.05;

// pseudorandom number based on time
float random(in float time) {
    return fract(sin(time) * 100000.0);
}

// scanlines effect via RGB subpixel masking
vec4 screenDoor(vec4 color) {
    vec2 modPos = vUV * uResolution;
    float x = mod(modPos.x, SCANLINE_WIDTH) / 3.0;
    float y = mod(modPos.y, SCANLINE_HEIGHT + 1.0);

    vec2 bvector = vec2(BRIGHTNESS);
    if (x < 0.33) color.gb *= bvector;
    else if (x < 0.66) color.rb *= bvector;
    else color.rg *= bvector;

    if (y <= 1.0) color.rgb *= vec3(0);

    return color;
}

// chromatic aberration (color separation)
vec4 separate() {
    float offset = 0.5 * float(SEPARATION_PIXELS) / uResolution.x;
    vec4 blue = texture(uPrevRender, vUV - vec2(offset, 0.0)) * vec4(0, 0.5, 1, 1);
    vec4 red = texture(uPrevRender, vUV + vec2(offset, 0.0)) * vec4(1, 0.5, 0, 1);
    return blue + red;
}

// CRT flicker using pseudo-random time variation
vec4 flicker(vec4 color) {
    color.rgb *= vec3(1.0 - (random(uTime) * FLICKER_MAGNITUDE));
    return color;
}

void main() {
    fragColor = screenDoor(flicker(separate()));
}