#version 300 es
precision highp float;

// particle of map route (pixel of line, or marker), drawn from 5x5 bitmap

in vec2 vCell;      // position within particle, in pixels of font
flat in int vMask;  // 5x5 bitmap of particle (bit y * 5 + x set where lit, top row first)
in float vAlpha;
in vec3 vColor;
out vec4 fragColor;

void main() {
    ivec2 cell = clamp(ivec2(floor(vCell)), 0, 4);
    if ((vMask >> (cell.y * 5 + cell.x) & 1) == 0 || vAlpha < 0.005) discard;
    fragColor = vec4(vColor, vAlpha);
}
