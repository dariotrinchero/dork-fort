#version 300 es
precision mediump float;

uniform sampler2D uAtlas;

in vec2 vUV;
in vec3 vColor;
out vec4 fragColor;

void main() {
    float mask = texture(uAtlas, vUV).r;
    if (mask < 0.01) discard;
    fragColor = vec4(vColor * mask, 1.0);
}