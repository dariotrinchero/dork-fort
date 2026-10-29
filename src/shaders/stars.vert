#version 300 es

#include "particles.glsl"
// seed of star: position (xy), twinkle (z), & kind (w)

out vec2 vCell;  // position within star, in pixels of font
flat out float vSpan; // width of star, in pixels of font: 3 for a cross, else 1
out float vCore; // alpha of centre of star
out float vArms; // alpha of arms of star (0 unless it is a cross)
out vec3 vColor;

// parameters
const float CROSS_SHARE = 0.12; // share of stars drawn as crosses (brighter, with arms)
const float BASE = 0.25;        // alpha of typical star, at rest
const float TWINKLE = 0.5;      // depth of gentle twinkle, relative to rest
const float GLINT = 0.6;        // extra alpha at peak of occasional glint
const float GLINT_SHARPNESS = 60.0; // higher is a briefer glint
const float AVOID_PAD = 2.0;    // padding around region kept clear, in pixels of font

const vec3 WHITE = vec3(0.9, 0.92, 1.0);
const vec3 BLUE = vec3(0.7, 0.8, 1.0);
const vec3 WARM = vec3(1.0, 0.86, 0.68);

void main() {
    // centre of star: middle of a pixel of font
    vec2 cell = floor(iSeed.xy * uResolution / uFontPixel);
    vec2 centre = (cell + 0.5) * uFontPixel;

    // collapse stars in region kept clear
    if (avoided(centre, AVOID_PAD)) {
        gl_Position = OFFSCREEN;
        vCell = vec2(0.0);
        vSpan = 1.0;
        vCore = vArms = 0.0;
        vColor = vec3(0.0);
        return;
    }

    bool isCross = iSeed.w < CROSS_SHARE;
    vSpan = isCross ? 3.0 : 1.0;
    vCell = (aQuadVertPos + 1.0) * 0.5 * vSpan;
    gl_Position = quadVertex(centre - 0.5 * vSpan * uFontPixel, vSpan);

    // gentle twinkle (every few seconds), & rare, brief glint (every half-minute or so)
    float phase = TAU * iSeed.z;
    float twinkleRate = mix(0.15, 0.5, rand(iSeed.z, 1.0)); // cycles per second
    float glintRate = mix(0.02, 0.06, rand(iSeed.z, 2.0));
    float twinkle = 1.0 - TWINKLE * (0.5 + 0.5 * sin(TAU * twinkleRate * uTime + phase));
    float glint = GLINT * pow(0.5 + 0.5 * sin(TAU * glintRate * uTime + 3.0 * phase), GLINT_SHARPNESS);

    float magnitude = (isCross ? 1.5 : mix(0.4, 1.0, rand(iSeed.w, 3.0))) * BASE;
    vCore = uIntensity * min(1.0, magnitude * twinkle + glint);
    vArms = isCross ? uIntensity * (0.3 * magnitude * twinkle + 0.8 * glint) : 0.0;

    float tint = rand(iSeed.w, 4.0);
    vColor = tint < 0.15 ? WARM : tint < 0.45 ? BLUE : WHITE;
}
