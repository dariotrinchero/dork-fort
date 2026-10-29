#version 300 es

#include "particles.glsl"
#include "glyphs.glsl"
// seed of symbol: position (xy, reshuffled each life), lifetime, swirl, & character (z), & phase of life (w); each
// string is one character

out vec2 vUV;
out float vAlpha;
out vec3 vColor;

// parameters
const float MIN_LIFE = 8.0;    // shortest life of symbol, in seconds, from fading in to fading out
const float MAX_LIFE = 14.0;
const float MIN_RADIUS = 4.0;  // radius of arc along which symbol swirls, in pixels of font
const float MAX_RADIUS = 10.0;
const float MIN_SPIN = 0.15;   // angular speed of swirl, in radians per second
const float MAX_SPIN = 0.35;
const float RISE = 3.0;        // distance symbol rises over its life, in pixels of font
const float GROW = 1.8;        // scale of symbol as it fades out, relative to its size on fading in
const float PEAK = 0.3;        // alpha of symbol at its brightest
const float AVOID_PAD = 2.0;   // padding around region kept clear, in pixels of font

const vec3 LAVENDER = vec3(0.72, 0.64, 1.0);
const vec3 VIOLET = vec3(0.55, 0.45, 0.9);
const vec3 PALE = vec3(0.65, 0.85, 1.0);

void main() {
    // progress through current life (each life reshuffling position, swirl, & character)
    float life = mix(MIN_LIFE, MAX_LIFE, iSeed.z);
    float cycles = uTime / life + iSeed.w;
    float n = floor(cycles);
    float t = fract(cycles);
    vec2 home = vec2(rand(iSeed.x, n), rand(iSeed.y, n)) * uResolution;

    // swirl along an arc starting from home, rising slowly
    float radius = mix(MIN_RADIUS, MAX_RADIUS, rand(iSeed.z, n));
    float spin = mix(MIN_SPIN, MAX_SPIN, rand(iSeed.w, n)) * (rand(iSeed.x, n + 0.5) < 0.5 ? -1.0 : 1.0);
    float start = TAU * rand(iSeed.y, n + 0.5);
    float angle = start + spin * t * life;
    vec2 offset = radius * (vec2(cos(angle), sin(angle)) - vec2(cos(start), sin(start))) - vec2(0.0, RISE * t);
    vec2 centre = home + offset * uFontPixel;

    // collapse symbols in region kept clear
    if (avoided(centre, AVOID_PAD)) {
        gl_Position = OFFSCREEN;
        vUV = vec2(0.0);
        vAlpha = 0.0;
        vColor = vec3(0.0);
        return;
    }

    // grow as it goes, keeping upright, with corner on a whole pixel
    vec2 size = uGlyphSize * mix(1.0, GROW, smoothstep(0.0, 1.0, t));
    vec2 corner = floor(centre - 0.5 * size);
    vec2 local = (aQuadVertPos + 1.0) * 0.5;
    vec2 clipPos = (corner + local * size) / uResolution * 2.0 - 1.0;
    gl_Position = vec4(clipPos.x, -clipPos.y, 0.0, 1.0);

    int symbol = int(min(uStringCount - 1.0, floor(rand(iSeed.z, n + 0.5) * uStringCount)));
    vUV = glyphUV(glyphAt(symbol, 0));

    // fade in, & fade out while still growing
    float fade = smoothstep(0.0, 0.3, t) * (1.0 - smoothstep(0.55, 1.0, t));
    vAlpha = uIntensity * PEAK * fade;

    float tint = rand(iSeed.w, n + 0.5);
    vColor = tint < 0.15 ? PALE : mix(VIOLET, LAVENDER, rand(iSeed.x, n + 0.25));
}
