#version 300 es

#include "particles.glsl"
// seed of ember: column & height (xy, reshuffled each life), lifetime (z), & phase of life (w)

out float vAlpha;
out vec3 vColor;

// parameters
const float MIN_LIFE = 4.0;     // shortest life of ember, in seconds, from rising off bottom of screen to dying out
const float MAX_LIFE = 8.0;
const float MIN_HEIGHT = 0.2;   // lowest height reached by ember, as share of screen height
const float MAX_HEIGHT = 0.65;
const float SWAY = 3.0;         // amplitude of sway at top of rise, in pixels of font
const float DRIFT = 6.0;        // greatest sideways drift over life, in pixels of font
const float PEAK = 0.45;        // alpha of ember at its brightest
const float FLICKER = 0.3;      // depth of flicker, relative to brightness
const float BIG_SHARE = 0.2;    // share of embers starting as 2x2 sparks, before shrinking to 1x1

const vec3 HOT = vec3(1.0, 0.82, 0.4);   // colour of fresh ember
const vec3 COOL = vec3(0.85, 0.2, 0.05); // colour of dying ember

void main() {
    // progress through current life (each life reshuffling column, height, sway, & drift)
    float life = mix(MIN_LIFE, MAX_LIFE, iSeed.z);
    float cycles = uTime / life + iSeed.w;
    float n = floor(cycles);
    float t = fract(cycles);
    float column = rand(iSeed.x, n);
    float height = mix(MIN_HEIGHT, MAX_HEIGHT, rand(iSeed.y, n));
    float swayRate = mix(0.2, 0.5, rand(iSeed.x, n + 0.5)); // cycles per second
    float drift = DRIFT * (2.0 * rand(iSeed.y, n + 0.5) - 1.0);

    // rise from just below bottom of screen, swaying more widely as it goes
    float size = rand(iSeed.z, n) < BIG_SHARE && t < 0.4 ? 2.0 : 1.0;
    vec2 pos = vec2(
        column * uResolution.x
            + uFontPixel * (drift * t + SWAY * (0.2 + t) * sin(TAU * (swayRate * uTime + iSeed.w))),
        uResolution.y + uFontPixel - t * height * uResolution.y
    );
    vec2 corner = floor(pos / uFontPixel - 0.5 * size) * uFontPixel; // top-left, snapped to grid of font pixels

    // collapse embers in region kept clear
    if (avoided(corner + 0.5 * size * uFontPixel, 0.0)) {
        gl_Position = OFFSCREEN;
        vAlpha = 0.0;
        vColor = vec3(0.0);
        return;
    }
    gl_Position = quadVertex(corner, size);

    // flare up quickly, flicker, & cool from yellow to red as it dies out
    float flickerRate = mix(2.0, 5.0, rand(iSeed.z, n + 0.5));
    float flicker = 1.0 - FLICKER * (0.5 + 0.5 * sin(TAU * (flickerRate * uTime + iSeed.x)));
    float fade = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.4, 1.0, t));
    vAlpha = uIntensity * PEAK * fade * flicker;
    vColor = mix(HOT, COOL, smoothstep(0.0, 0.7, t));
}
