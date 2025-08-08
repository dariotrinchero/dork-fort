#version 300 es
precision mediump float;

uniform float uTime;           // animation time
uniform vec2 uResolution;      // render output size in pixels
uniform sampler2D uPrevRender; // result of previous render pass (to apply CRT effect to)

in vec2 vUV;
out vec4 fragColor;

// parameters
const float SCANLINE_WIDTH = 3.0; // should be >= 3
const float SCANLINE_HEIGHT = 2.0;
const float SCANLINE_GAP = 1.0;

const float BRIGHTNESS = 0.6;
const float SEPARATION_PIXELS = 2.5;
const float FLICKER_MAGNITUDE = 0.08;

// pseudorandom number in [0,1)
float random(in float seed) {
    return fract(sin(seed) * 100000.0);
}

// chromatic aberration (color separation)
vec4 separate() {
    float offset = 0.5 * SEPARATION_PIXELS / uResolution.x;
    vec4 blue = texture(uPrevRender, vUV - vec2(offset, 0.0)) * vec4(0, 0.5, 1, 1);
    vec4 red = texture(uPrevRender, vUV + vec2(offset, 0.0)) * vec4(1, 0.5, 0, 1);
    return blue + red;
}

// CRT flicker using pseudo-random time variation
vec4 flicker(vec4 color) {
    color.rgb *= vec3(1.0 - (random(uTime) * FLICKER_MAGNITUDE));
    return color;
}

// scanlines effect via RGB subpixel masking
vec4 screenDoor(vec4 color) {
    vec2 pixelPos = vUV * uResolution;
    float x = mod(pixelPos.x, SCANLINE_WIDTH) / SCANLINE_WIDTH;
    float y = mod(pixelPos.y, SCANLINE_HEIGHT + SCANLINE_GAP);

    vec2 bvector = vec2(BRIGHTNESS);
    if (x < 0.33) color.gb *= bvector;
    else if (x < 0.66) color.rb *= bvector;
    else color.rg *= bvector;

    if (y <= SCANLINE_GAP) color.rgb *= vec3(0.7 * abs(0.5 * SCANLINE_GAP - y));

    return color;
}

// darken corners of screen
vec4 vignette(vec4 color) {
    float dist = distance(vUV, vec2(0.5));
    color.rgb *= smoothstep(0.85, 0.5, dist);
    return color;
}

void main() {
    fragColor = vignette(screenDoor(flicker(separate())));
}