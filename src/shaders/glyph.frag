#version 300 es
precision highp float;

// particle drawn as a character from font atlas (eg. symbols, greetings), in a single colour

uniform sampler2D uAtlas;

in vec2 vUV;
in float vAlpha;
in vec3 vColor;
out vec4 fragColor;

void main() {
    float alpha = vAlpha * texture(uAtlas, vUV).r;
    if (alpha < 0.005) discard;
    fragColor = vec4(vColor, alpha);
}
