#version 300 es
precision highp float;

uniform sampler2D uPrevRender; // result of previous render pass (to warp)

// parameters of warp (see warp.ts, which mirrors this shader for pointer hit-testing)
uniform float uRadius;
uniform float uMagnitude;
uniform float uCutoff;

in vec2 vUV;
out vec4 fragColor;

// curved monitor distortion effect
vec2 curvedMonitor(vec2 uv) {
    vec2 coords = uv - 0.5;
    float t = length(coords) / uRadius;
    coords *= (1.0 / uCutoff - uMagnitude + uMagnitude * t * t * t * t) * uCutoff;
    return coords + 0.5;
}

void main() {
    vec2 warpedUV = curvedMonitor(vUV);
    if (any(lessThan(warpedUV, vec2(0.0))) || any(greaterThan(warpedUV, vec2(1.0)))) discard;
    fragColor = texture(uPrevRender, warpedUV);
}