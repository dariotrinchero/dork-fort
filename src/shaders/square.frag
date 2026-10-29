#version 300 es
precision highp float;

// particle drawn as a plain square (eg. embers, motes), in a single colour

in float vAlpha;
in vec3 vColor;
out vec4 fragColor;

void main() {
    if (vAlpha < 0.005) discard;
    fragColor = vec4(vColor, vAlpha);
}
