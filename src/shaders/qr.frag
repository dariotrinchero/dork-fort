#version 300 es
precision highp float;

uniform sampler2D uQR;      // one texel per module (including quiet zone), with group index in alpha channel
uniform vec2 uResolution;   // render output size in pixels
uniform vec2 uOrigin;       // position of QR code's top-left corner, in pixels from top-left of output
uniform float uModuleSize;  // width & height of each module, in (whole) pixels

out vec4 fragColor;

void main() {
    // module containing fragment, counted from top-left
    vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
    ivec2 cell = ivec2(floor((pixel - uOrigin) / uModuleSize));

    // quiet zone around QR code consists of background modules, so clamping extends background to whole output
    ivec2 lastCell = textureSize(uQR, 0) - 1;
    fragColor = vec4(texelFetch(uQR, clamp(cell, ivec2(0), lastCell), 0).rgb, 1.0);
}
