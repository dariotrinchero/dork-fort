#version 300 es
precision highp float;

const int MAX_REGIONS = 8; // see qrRenderer.ts

uniform sampler2D uQR;      // one texel per module (including quiet zone), with region tag in alpha channel
uniform vec2 uResolution;   // render output size in pixels
uniform vec2 uOrigin;       // position of QR code's top-left corner, in pixels from top-left of output
uniform float uModuleSize;  // width & height of each module, in (whole) pixels

uniform float uHover[MAX_REGIONS]; // hover intensity of each region, in [0,1]
uniform float uFocus;              // greatest hover intensity over all regions

out vec4 fragColor;

// parameters
const float FADE = 0.3;  // brightness of modules outside hovered region, at full hover
const float BOOST = 0.5; // extra brightness of hovered region, at full hover

void main() {
    // module containing fragment, counted from top-left
    vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
    ivec2 cell = ivec2(floor((pixel - uOrigin) / uModuleSize));

    // quiet zone around QR code consists of background modules, so clamping extends background to whole output
    ivec2 lastCell = textureSize(uQR, 0) - 1;
    vec4 texel = texelFetch(uQR, clamp(cell, ivec2(0), lastCell), 0);

    // highlight hovered region, fading other modules (but not background)
    int tag = int(round(texel.a * 255.0)); // 0: background; 1: module in no region; k + 2: module in region k
    vec3 color = texel.rgb;
    if (tag > 0) {
        float hover = tag > 1 ? uHover[tag - 2] : 0.0;
        color *= mix(1.0, FADE, max(uFocus - hover, 0.0)) * (1.0 + BOOST * hover);
    }

    fragColor = vec4(color, 1.0);
}
