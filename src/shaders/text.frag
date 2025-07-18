#version 300 es
precision mediump float;

uniform sampler2D uAtlas;

in vec2 vUV;
in vec3 vColor;
out vec4 fragColor;

void main() {
    float alpha = texture(uAtlas, vUV).r;
    fragColor = vec4(vColor, alpha);
}