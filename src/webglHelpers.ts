import type { Dimensions, Pos, RGBA } from "types/global";

type ShaderType = WebGLRenderingContextBase["FRAGMENT_SHADER"] | WebGLRenderingContextBase["VERTEX_SHADER"];
type MinMagFilterType = WebGLRenderingContext["NEAREST"] | WebGLRenderingContext["LINEAR"];

/**
 * Compile WebGL shader from given source code. 
 * 
 * @param gl WebGL rendering context
 * @param type type of shader
 * @param src source code of shader
 * @returns the compiled WebGL shader
 */
const compileShader = (gl: WebGLRenderingContext, type: ShaderType, src: string): WebGLShader => {
    const shader = gl.createShader(type)!;
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
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) || "Program link error");

    return program;
};

/**
 * Create WebGL texture of given width & height with 0 mip level, no border, and initial data as given.
 * 
 * @param gl WebGL rendering context
 * @param texDims dimensions of texture to create
 * @param texData texture image source, or function mapping pixel coordinates to RGBA
 * @param minMagFilters minification & magnification filters for resizing texture
 * @returns created texture
 */
export const createTexture = (
    gl: WebGLRenderingContext,
    texDims: Dimensions,
    texData?: ((pos: Pos) => RGBA) | TexImageSource,
    minMagFilters: MinMagFilterType = gl.LINEAR
): WebGLTexture => {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);

    // inititalize texture
    if (typeof texData === "function") {
        // initialize from function
        const data = new Uint8Array(texDims[0] * texDims[1] * 4);
        for (let y = 0; y < texDims[1]; y++) {
            for (let x = 0; x < texDims[0]; x++) {
                const i = (y * texDims[0] + x) * 4;
                const [r, g, b, a] = texData([x, y]);
                data[i + 0] = r;
                data[i + 1] = g;
                data[i + 2] = b;
                data[i + 3] = a;
            }
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ...texDims, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    } else if (texData !== undefined) {
        // initialize from image source
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texData);
    } else {
        // no initial data
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ...texDims, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minMagFilters);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, minMagFilters);
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
 * Create array buffer (typically to be used as a vertex attribute buffer), with given float data.
 * 
 * @param gl WebGL rendering context
 * @param data array of 32-bit floats to assign to buffer
 * @param buf previous instance of buffer; if supplied, buffer is merely refreshed rather than recreated
 * @returns newly-created or refreshed buffer
 */
export const arrayBufFromData = (gl: WebGLRenderingContext, data: Float32Array, buf?: WebGLBuffer): WebGLBuffer => {
    buf = buf ?? gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
};