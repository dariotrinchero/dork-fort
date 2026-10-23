import type {
    MinMagFilterType,
    ShaderType,
    TextureData
} from "types/webglHelpers";
import type { VertexAttribs } from "types/renderPipeline";

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
 * @param flipY flip data vertically on upload, so that its first row lies at v = 1 (eg. for images drawn on
 *              screen quads, which have v = 0 at the bottom)
 * @returns created texture
 */
export const createTexture = (
    gl: WebGLRenderingContext,
    data: TextureData,
    minMagFilters: MinMagFilterType = gl.LINEAR,
    flipY = false
): WebGLTexture => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);

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
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

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
 * @param usage usage hint; use DYNAMIC_DRAW for buffers that are updated often
 * @returns newly-created buffer
 */
export const arrayBufFromData = (gl: WebGLRenderingContext, data: Float32Array, usage: GLenum = gl.STATIC_DRAW): WebGLBuffer => {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    return buf;
};

/**
 * Create array buffer containing the vertices of a quad covering clip space, as two triangles.
 * 
 * @param gl WebGL rendering context
 * @returns newly-created buffer of 6 2D vertices
 */
export const createQuadBuffer = (gl: WebGLRenderingContext): WebGLBuffer =>
    arrayBufFromData(gl, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]));

/**
 * Create vertex array object binding given vertex attributes to given WebGL program. Attributes not used by
 * the program are skipped.
 * 
 * @param gl WebGL rendering context
 * @param program WebGL program whose attribute locations to bind
 * @param attribs vertex attributes needed by WebGL program
 * @returns vertex array object recording attribute bindings
 */
export const createVertexArray = (
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    attribs: VertexAttribs
): WebGLVertexArrayObject => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    Object.entries(attribs).forEach(([name, { buffer, itemSize, type, instanced }]) => {
        const location = gl.getAttribLocation(program, name);
        if (location === -1) return;

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, itemSize, type ?? gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(location, instanced ? 1 : 0);
    });

    gl.bindVertexArray(null);
    return vao;
};
