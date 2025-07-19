#version 300 es

in vec2 aPos; // quad vertex positions
out vec2 vUV; // output UV coordinate

void main() {
    vUV = (aPos + 1.0) * 0.5; // convert clip-space [-1,1] to UV [0,1]
    gl_Position = vec4(aPos, 0.0, 1.0);
}