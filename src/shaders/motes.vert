#version 300 es

#include "particles.glsl"
// seed of mote: position (xy, reshuffled each life), lifetime & wander (z), & phase of life (w)

out float vAlpha;
out vec3 vColor;

// parameters
const float MIN_LIFE = 6.0;     // shortest life of mote, in seconds, from fading in to fading out
const float MAX_LIFE = 12.0;
const float WANDER = 5.0;       // amplitude of wandering, in pixels of font (of largest of its 3 octaves)
const float SETTLE = 4.0;       // distance mote sinks over its life, in pixels of font
const float PEAK = 0.5;         // alpha of mote at its brightest
const float SHIMMER = 0.4;      // depth of shimmer as mote turns in the light, relative to brightness
const float BEAM_SLANT = 0.5;   // horizontal shift of sunbeam per pixel down, rightwards
const float BEAM_START = 0.15;  // where middle of sunbeam meets top of screen, as share of screen width
const float BEAM_WIDTH = 0.3;   // half-width of sunbeam, as share of screen height
const float BEAM_FLOOR = 0.3;   // brightness of motes outside sunbeam, relative to those in it (1 for no sunbeam)

const vec3 POLLEN = vec3(0.92, 0.9, 0.45);
const vec3 LEAF = vec3(0.6, 0.85, 0.3);
const vec3 GOLD = vec3(1.0, 0.82, 0.45);

// wandering offset (in pixels of font) along one axis: sum of incommensurate sines, so that it never repeats,
// with random rates & phases from given seed
float wander(float seed) {
    float sum = 0.0;
    float amplitude = WANDER;
    float rate = mix(0.04, 0.08, rand(seed, 1.0)); // cycles per second
    for (int i = 0; i < 3; i++) {
        float salt = float(i) + 2.0;
        sum += amplitude * sin(TAU * (rate * uTime + rand(seed, salt)));
        amplitude *= 0.45;
        rate *= mix(2.3, 2.9, rand(seed, salt + 0.5));
    }
    return sum;
}

void main() {
    // progress through current life (each life reshuffling position)
    float life = mix(MIN_LIFE, MAX_LIFE, iSeed.z);
    float cycles = uTime / life + iSeed.w;
    float n = floor(cycles);
    float t = fract(cycles);
    vec2 home = vec2(rand(iSeed.x, n), rand(iSeed.y, n)) * uResolution;

    // wander about home, sinking slowly
    vec2 offset = vec2(wander(iSeed.z), wander(iSeed.z + 0.37)) + vec2(0.0, SETTLE * t);
    vec2 corner = floor(home / uFontPixel + offset) * uFontPixel; // top-left, snapped to grid of font pixels

    // collapse motes in region kept clear
    if (avoided(corner + 0.5 * uFontPixel, 1.0)) {
        gl_Position = OFFSCREEN;
        vAlpha = 0.0;
        vColor = vec3(0.0);
        return;
    }
    gl_Position = quadVertex(corner, 1.0);

    // fade in & out over life, shimmering, & brightest in sunbeam slanting down from top of screen
    float shimmerRate = mix(0.5, 1.5, rand(iSeed.w, n)); // cycles per second
    float shimmer = 1.0 - SHIMMER * (0.5 + 0.5 * sin(TAU * (shimmerRate * uTime + iSeed.x)));
    float fade = sin(3.14159265 * t);
    float across = (corner.x - BEAM_START * uResolution.x - BEAM_SLANT * corner.y) / uResolution.y;
    float beam = mix(BEAM_FLOOR, 1.0, exp(-pow(across / BEAM_WIDTH, 2.0)));
    vAlpha = uIntensity * PEAK * fade * fade * shimmer * beam;

    float tint = rand(iSeed.y, n + 0.5);
    vColor = tint < 0.15 ? GOLD : mix(LEAF, POLLEN, rand(iSeed.x, n + 0.5));
}
