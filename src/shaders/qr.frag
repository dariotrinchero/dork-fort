#version 300 es
precision highp float;

const int MAX_REGIONS = 8;    // see qrRenderer.ts
const int OUTSIDE_ICON = 128; // see qrRenderer.ts

uniform sampler2D uQR;      // one texel per module (including quiet zone), with tag in alpha channel
uniform vec2 uResolution;   // render output size in pixels
uniform vec2 uOrigin;       // position of QR code's top-left corner, in pixels from top-left of output
uniform float uModuleSize;  // width & height of each module, in (whole) pixels

uniform float uHover[MAX_REGIONS]; // hover intensity of each region, in [0,1]
uniform float uFocus;              // greatest hover intensity over all regions

// selection, as a float since render pipeline only supports float uniforms
uniform float uSelected; // index of selected region (-1 if none)
uniform float uDismiss;  // fade of modules (except selected region's icon) into background, in [0,1]
uniform float uSlide;    // vertical offset (in whole pixels, negative is up) at which selected icon is redrawn

out vec4 fragColor;

// parameters
const float FADE = 0.3;  // brightness of modules outside hovered region, at full hover
const float BOOST = 0.5; // extra brightness of hovered region, at full hover

void main() {
    // module containing fragment, counted from top-left
    vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
    ivec2 cell = ivec2(floor((pixel - uOrigin) / uModuleSize));

    // quiet zone around QR code consists of background modules, so clamping extends background to whole output
    ivec2 lastCell = textureSize(uQR, 0) - 1;
    vec4 texel = texelFetch(uQR, clamp(cell, ivec2(0), lastCell), 0);

    // tag is 0 for background, 1 for modules in no region, & k + 2 for modules in region k, plus OUTSIDE_ICON for
    // those outside its icon (see qrRenderer.ts); hence the tag of the selected region's icon is selected + 2
    int tag = int(round(texel.a * 255.0));
    int region = tag % OUTSIDE_ICON - 2; // -2 for background, -1 for no region

    // highlight hovered region, fading other modules (but not background)
    vec3 color = texel.rgb;
    if (tag > 0) {
        float hover = region >= 0 ? uHover[region] : 0.0;
        color *= mix(1.0, FADE, max(uFocus - hover, 0.0)) * (1.0 + BOOST * hover);
    }

    // fade modules into background, & redraw selected icon (in place of its own modules) at its offset
    int selected = int(uSelected);
    vec3 background = texelFetch(uQR, ivec2(0), 0).rgb; // corner of quiet zone
    color = selected >= 0 && tag == selected + 2 ? background : mix(color, background, uDismiss);
    if (selected >= 0) {
        ivec2 slidCell = ivec2(floor((pixel - uOrigin - vec2(0.0, uSlide)) / uModuleSize));
        vec4 slid = texelFetch(uQR, clamp(slidCell, ivec2(0), lastCell), 0);
        if (int(round(slid.a * 255.0)) == selected + 2) color = slid.rgb * (1.0 + BOOST * uHover[selected]);
    }

    fragColor = vec4(color, 1.0);
}
