#version 300 es

in vec2 aQuadVertPos; // quad vertex positions
out vec2 vUV;         // output UV coordinate

void main() {
    vUV = (aQuadVertPos + 1.0) * 0.5; // convert clip-space [-1,1] to UV [0,1]
    gl_Position = vec4(aQuadVertPos, 0.0, 1.0);
}