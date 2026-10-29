#version 300 es
precision highp float;

in vec2 vCell;  // position within star, in pixels of font
flat in float vSpan; // width of star, in pixels of font: 3 for a cross, else 1
in float vCore; // alpha of centre of star
in float vArms; // alpha of arms of star (0 unless it is a cross)
in vec3 vColor;
out vec4 fragColor;

void main() {
    // a cross is lit at its centre & the 4 pixels beside it (its arms), but not at its corners
    vec2 cell = floor(vCell) - floor(0.5 * vSpan); // relative to centre
    bool core = all(equal(cell, vec2(0.0)));
    if (!core && cell.x != 0.0 && cell.y != 0.0) discard;

    float alpha = core ? vCore : vArms;
    if (alpha < 0.005) discard;
    fragColor = vec4(vColor, alpha);
}
