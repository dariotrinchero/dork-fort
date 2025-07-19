import type { ShaderType } from "types/webglHelpers";

/**
 * Compile WebGL shader from given source code. 
 * 
 * @param gl WebGL rendering context
 * @param type type of shader (fragment or vertex)
 * @param src source code of shader
 * @returns the compiled WebGL shader
 */
const compileShader = (gl: WebGLRenderingContext, type: ShaderType, src: string): WebGLShader => {
    const shader = gl.createShader(type === "vert" ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader) || "Shader compile error");

    return shader;
};

/**
 * Compile and link WebGL program, attaching vertex and fragment shaders with given source code.
 * 
 * @param gl WebGL rendering context
 * @param vsSrc vertex shader source code
 * @param fsSrc fragment shader source code
 * @returns compiled and linked WebGL program
 */
export const createProgram = (gl: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram => {
    const program = gl.createProgram()!;
    gl.attachShader(program, compileShader(gl, "vert", vsSrc));
    gl.attachShader(program, compileShader(gl, "frag", fsSrc));
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) || "Program link error");

    return program;
};

/**
 * Create WebGL texture of given width & height with 0 mip level, no border, and no initial data.
 * 
 * @param gl WebGL rendering context
 * @param width desired width of texture
 * @param height desired height of texture
 * @returns created texture
 */
export const createTexture = (gl: WebGLRenderingContext, width: number, height: number, fill: boolean = false): WebGLTexture => {
    // TODO temp
    let data = null;
    if (fill) {
        data = new Uint8Array(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                data[i + 0] = x;       // Red: horizontal gradient
                data[i + 1] = y;       // Green: vertical gradient
                data[i + 2] = 255 - x; // Blue: inverse horizontal
                data[i + 3] = 255;     // Alpha
            }
        }
    }

    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
};

/**
 * Create WebGL frame buffer from given texture.
 * 
 * @param gl WebGL rendering context
 * @param texture texture to use for frame buffer
 * @returns the created frame buffer
 */
export const createFramebuffer = (gl: WebGLRenderingContext, texture: WebGLTexture): WebGLFramebuffer => {
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return fb;
};

/**
 * TODO
 * 
 * @param gl 
 * @param data 
 * @returns 
 */
export const createInstanceBuffer = (gl: WebGLRenderingContext, data: Float32Array): WebGLBuffer => {
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
};