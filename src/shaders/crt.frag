#version 300 es
precision highp float;

uniform float uFlicker;        // pseudorandom value in [0,1), varying per frame
uniform vec2 uResolution;      // render output size in pixels
uniform float uFontPixel;      // render output pixels per pixel of font (whole number, divisible by 2 or 3)
uniform sampler2D uPrevRender; // result of previous render pass (to apply CRT effect to)
uniform float uCRT;            // 1 to apply CRT effect, or 0 to pass previous render pass through unchanged
uniform float uMono;           // 1 for monochrome screen, or 0 for colour screen
uniform vec3 uPhosphor;        // phosphor colour of monochrome screen

in vec2 vUV;
out vec4 fragColor;

// parameters
const float SCANLINE_GAP = 1.0; // dark rows of 'CRT pixels' per scanline

const float BRIGHTNESS = 0.6;          // brightness of masked subpixels
const float MASK_MEAN = (1.0 + 2.0 * BRIGHTNESS) / 3.0; // mean brightness through subpixel mask
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);         // weights of colour channels in luminance
const float GAIN = 1.4;                // overall brightness boost, applied after masking to preserve its contrast
const float SEPARATION_PIXELS = 2.5;
const float FLICKER_MAGNITUDE = 0.08;

const float GLOW_RADIUS = 8.0;         // in CSS pixels
const float GLOW_STRENGTH = 0.25;
const int GLOW_TAPS = 24;
const float GOLDEN_ANGLE = 2.39996323;

// chromatic aberration (color separation)
vec4 separate() {
    float crtPixel = uFontPixel / 3.0; // render output pixels per CRT pixel, as if mask were a triad
    float offset = 0.5 * SEPARATION_PIXELS * crtPixel / uResolution.x;
    vec4 blue = texture(uPrevRender, vUV - vec2(offset, 0.0)) * vec4(0, 0.5, 1, 1);
    vec4 red = texture(uPrevRender, vUV + vec2(offset, 0.0)) * vec4(1, 0.5, 0, 1);
    return vec4(blue.rgb + red.rgb, 0.5 * (blue.a + red.a));
}

// CRT flicker using pseudo-random time variation
vec4 flicker(vec4 color) {
    color.rgb *= vec3(1.0 - (uFlicker * FLICKER_MAGNITUDE));
    return color;
}

// colour of light emitted by phosphor (for monochrome screen) when struck as brightly as given colour
vec3 phosphor(vec3 color) {
    return uMono > 0.5 ? dot(color, LUMA) * uPhosphor : color;
}

// scanlines effect via subpixel masking (except on monochrome screen, which has no mask): each pixel of font spans
// one period of mask & one scanline, ie. 3 'CRT pixels' (RGB triad; 2 lit rows & a dark one) where it divides by 3,
// & else 2 (magenta & green; a lit row & a dimmed one)
vec4 screenDoor(vec4 color) {
    float period = mod(uFontPixel, 3.0) < 0.5 ? 3.0 : 2.0;
    vec2 pixelPos = floor(vUV * uResolution * period / uFontPixel) + 0.5; // center of 'CRT pixel' containing fragment
    float x = mod(pixelPos.x, period);
    float y = mod(pixelPos.y, period);

    vec2 bvector = vec2(BRIGHTNESS);
    if (uMono > 0.5) color.rgb *= MASK_MEAN;
    else if (period < 2.5) {
        if (x < 1.0) color.g *= BRIGHTNESS;
        else color.rb *= bvector;
    }
    else if (x < 1.0) color.gb *= bvector;
    else if (x < 2.0) color.rb *= bvector;
    else color.rg *= bvector;

    if (y <= SCANLINE_GAP) color.rgb *= period < 2.5 ? vec3(0.5) : vec3(0.7 * abs(0.5 * SCANLINE_GAP - y));

    return color;
}

// soft glow (halation), as weighted average of samples spread evenly over a disc (Vogel spiral)
vec3 glow() {
    float crtPixel = uFontPixel / 3.0; // render output pixels per CRT pixel, as if mask were a triad
    vec2 radius = GLOW_RADIUS * crtPixel / uResolution;
    vec3 sum = vec3(0.0);
    float totalWeight = 0.0;
    for (int i = 0; i < GLOW_TAPS; i++) {
        float r = sqrt((float(i) + 0.5) / float(GLOW_TAPS));
        float theta = float(i) * GOLDEN_ANGLE;
        float weight = exp(-3.0 * r * r); // approximately Gaussian falloff
        sum += weight * texture(uPrevRender, vUV + radius * r * vec2(cos(theta), sin(theta))).rgb;
        totalWeight += weight;
    }
    return sum / totalWeight;
}

// darken corners of screen
vec4 vignette(vec4 color) {
    float dist = distance(vUV, vec2(0.5));
    color.rgb *= smoothstep(0.85, 0.5, dist);
    return color;
}

void main() {
    if (uCRT < 0.5) {
        fragColor = texture(uPrevRender, vUV);
        return;
    }

    // monochrome screen has a single electron beam, so no colour separation
    vec4 color = uMono > 0.5 ? texture(uPrevRender, vUV) : separate();
    color.rgb = phosphor(color.rgb);
    color = screenDoor(color);
    color.rgb = color.rgb * GAIN + phosphor(glow()) * GLOW_STRENGTH;
    fragColor = vignette(flicker(color));
}