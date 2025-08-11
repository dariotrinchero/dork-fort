import type {
    MinMagFilterType,
    ShaderType,
    TextureData
} from "types/webglHelpers";

/**
 * Compile WebGL shader from given source code. 
 * 
 * @param gl WebGL rendering context
 * @param type type of shader
 * @param src source code of shader
 * @returns the compiled WebGL shader
 */
const compileShader = (gl: WebGLRenderingContext, type: ShaderType, src: string): WebGLShader => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Error in creating shader of given type");

    gl.shaderSource(shader, src);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile error");

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
    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) ?? "Program link error");

    return program;
};

/**
 * Create WebGL texture of given width & height with 0 mip level, no border, and initial data as given.
 * 
 * @param gl WebGL rendering context
 * @param data initial data with which to create texture
 * @param minMagFilters minification & magnification filters for resizing texture
 * @returns created texture
 */
export const createTexture = (gl: WebGLRenderingContext, data: TextureData, minMagFilters: MinMagFilterType = gl.LINEAR): WebGLTexture => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);

    if ("dims" in data) {
        let dataArr = null;

        if (data.colorFn !== undefined) {
            dataArr = new Uint8Array(data.dims[0] * data.dims[1] * 4);
            for (let y = 0; y < data.dims[1]; y++) {
                for (let x = 0; x < data.dims[0]; x++) {
                    const i = (y * data.dims[0] + x) * 4;
                    const [r, g, b, a] = data.colorFn([x, y]);
                    dataArr[i + 0] = r;
                    dataArr[i + 1] = g;
                    dataArr[i + 2] = b;
                    dataArr[i + 3] = a;
                }
            }
        }

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ...data.dims, 0, gl.RGBA, gl.UNSIGNED_BYTE, dataArr);
    } else {
        // initialize from image source (<img>, <canvas>, etc)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
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
    const fb = gl.createFramebuffer();
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
    buf = buf ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
};