// shared by vertex shaders of particle effects (see particles.ts), each computing its particles from seed & time

uniform vec2 uResolution; // output size in pixels
uniform float uFontPixel; // output pixels per pixel of font, to whose grid particles snap
uniform float uTime;      // time in seconds
uniform float uIntensity; // fade of effect, in [0, 1]
uniform vec4 uAvoid;      // region kept clear of particles: left, top, right, & bottom, in pixels from top-left

in vec2 aQuadVertPos; // quad vertex positions
in vec4 iSeed;        // random seed of particle, in [0, 1) (each effect describing its use)

const float TAU = 6.28318531;
const vec4 OFFSCREEN = vec4(2.0, 2.0, 0.0, 1.0); // clip-space position collapsing a particle out of sight

// pseudorandom value in [0, 1), derived from seed (each salt giving an independent value)
float rand(float seed, float salt) {
    return fract(sin(seed * 12.9898 + salt * 78.233) * 43758.5453);
}

// whether given position (in pixels) lies in region kept clear of particles, padded by given pixels of font
bool avoided(vec2 pos, float pad) {
    vec2 padding = vec2(pad * uFontPixel);
    return all(greaterThan(pos, uAvoid.xy - padding)) && all(lessThan(pos, uAvoid.zw + padding));
}

// clip-space position of vertex of quad with given top-left corner (in pixels) & width (in pixels of font)
vec4 quadVertex(vec2 corner, float span) {
    vec2 clipPos = (corner + (aQuadVertPos + 1.0) * 0.5 * span * uFontPixel) / uResolution * 2.0 - 1.0;
    return vec4(clipPos.x, -clipPos.y, 0.0, 1.0);
}
