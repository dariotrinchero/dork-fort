#version 300 es
precision mediump float;

uniform sampler2D uPrevRender; // result of previous render pass (to warp)

in vec2 vUV;
out vec4 fragColor;

// parameters
const float RADIUS = 0.5;
const float MAGNITUDE = 0.05;
const float CUTOFF = 0.3;

// quartic easing function
float easeInQuart(float t, float b, float c, float d) {
    float x = t / d;
    return c * x * x * x * x + b;
}

// curved monitor distortion effect
vec2 curvedMonitor(vec2 uv) {
    vec2 center = vec2(0.5);
    vec2 coords = uv - center;
    coords *= easeInQuart(length(coords), 1.0 / CUTOFF - MAGNITUDE, MAGNITUDE, RADIUS) * CUTOFF;
    return coords + center;
}

void main() {
    vec2 warpedUV = curvedMonitor(vUV);
    if (any(lessThan(warpedUV, vec2(0.0))) || any(greaterThan(warpedUV, vec2(1.0)))) discard;
    fragColor = texture(uPrevRender, warpedUV);
}