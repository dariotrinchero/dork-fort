# Dork Fort Neocities Project

## Resources

- Existing [text tile engine](https://github.com/tapio/unicodetiles.js) for reference

## To-do list

1. Use the generalized render pipeline to create a simple shader that averages the colors of pixels within
   blocks, & outputs a smaller image with only the averages per block. ChatGPT suggests:
    ```glsl
    precision highp float;

    uniform sampler2D uImage;
    uniform vec2 uImageSize;   // in pixels
    uniform vec2 uGridSize;    // cols, rows

    void main() {
        vec2 cellSize = uImageSize / uGridSize;
        vec2 cellCoord = floor(gl_FragCoord.xy / cellSize);
        vec2 cellOrigin = cellCoord * cellSize;

        // We'll do a fixed 4×4 supersample
        const int samples = 4;
        vec3 sum = vec3(0.0);

        for (int y = 0; y < samples; y++) {
            for (int x = 0; x < samples; x++) {
                vec2 offset = vec2(float(x) + 0.5, float(y) + 0.5) * (cellSize / float(samples));
                vec2 samplePos = cellOrigin + offset;
                vec2 uv = samplePos / uImageSize;
                sum += texture2D(uImage, uv).rgb;
            }
        }

        vec3 avg = sum / float(samples * samples);
        gl_FragColor = vec4(avg, 1.0);
    }

    ```
    After rendering to an FBO of size (cols, rows), you can use:
    ```typescript
    const pixels = new Uint8Array(cols * rows * 4);
    gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    ```
    Then chain this with a shader that computes luminence.

1. Optimize `RenderPipeline` by not creating buffers each frame — see comment in code for `runPasses()`.