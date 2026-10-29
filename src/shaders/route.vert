#version 300 es

#include "particles.glsl"
// particles of ROUTES routes, by instance: for each route (PARTICLES apiece), its start (0) & end (1) markers, then
// each lit pixel of its dashed line, in order; seeds are unused, as all particles of a route share its path

out vec2 vCell;      // position within particle, in pixels of font
flat out int vMask;  // 5x5 bitmap of particle (bit y * 5 + x set where lit, top row first)
out float vAlpha;
out vec3 vColor;

// parameters
const int MAX_STEPS = 720;      // most pixels along route
const float LENGTH = 0.75;      // length of route, as share of screen width (in steps, at least MIN_STEPS)
const float MIN_STEPS = 150.0;
const int DASH = 3;             // lit pixels per dash
const int GAP = 11;             // unlit pixels between dashes
const float DRAW_SPEED = 100.0; // pixels of font drawn per second
const float HOLD = 3.0;         // seconds for which route lingers once drawn
const float FADE = 1.5;         // seconds over which route fades
const float REST = 2.0;         // mean seconds after route fades before the next one in its place starts (randomly
                                // from none to twice as long)
const int ROUTES = 2;           // routes drawn at once (at most), half a cycle apart
const float MEANDER = 0.5;      // amplitude of meander of heading, in radians
const float WAVELENGTH = 280.0; // pixels of font per meander
const float MAX_CURVE = 0.0015; // greatest steady turn of route, in radians per pixel of font
const float PEAK = 0.2;         // alpha of route once drawn
const float NIB = 0.3;          // extra alpha of freshly drawn pixels, fading as the line moves on
const float AVOID_PAD = 2.0;    // padding around region kept clear, in pixels of font
const int MARKER_CLEARANCE = 3; // pixels of line left unlit beside markers

// particles per route: 2 markers, & lit pixels of line (matching count in particles.ts)
const int PARTICLES = 2 + (MAX_STEPS * DASH + DASH + GAP - 1) / (DASH + GAP);

const vec3 INK = vec3(0.85, 0.75, 0.55);
const vec3 MARK = vec3(0.95, 0.4, 0.3);

// 5x5 bitmaps: a pixel of the line, the ring marking the start, & the cross marking the end
const int DOT = 4096;        // .....  .....  #...#
const int RING = 469440;     // .....  .###.  .#.#.
const int CROSS = 18157905;  // ..#..  .#.#.  ..#..
                             // .....  .###.  .#.#.
                             // .....  .....  #...#

void main() {
    // progress through current cycle of particle's route (each cycle starting a new path after a random delay of
    // up to twice REST, & routes being half a cycle apart)
    int route = gl_InstanceID / PARTICLES;
    int id = gl_InstanceID % PARTICLES;
    float seed = 10.0 * float(route);
    vec2 grid = uResolution / uFontPixel; // output size, in pixels of font
    int steps = int(min(float(MAX_STEPS), max(MIN_STEPS, LENGTH * grid.x)));
    float drawTime = float(steps) / DRAW_SPEED;
    float period = drawTime + HOLD + FADE + 2.0 * REST;
    float cycles = uTime / period + float(route) / float(ROUTES);
    float n = floor(cycles);
    float time = fract(cycles) * period - 2.0 * REST * rand(seed + 7.5, n);

    // route: from a random point near one side, heading across screen, meandering
    bool fromLeft = rand(seed + 0.5, n) < 0.5;
    vec2 start = vec2(fromLeft ? 0.05 + 0.1 * rand(seed + 1.5, n) : 0.95 - 0.1 * rand(seed + 1.5, n),
        0.2 + 0.6 * rand(seed + 2.5, n)) * grid;
    float startHeading = (fromLeft ? 0.0 : 0.5 * TAU) + 0.6 * (rand(seed + 3.5, n) - 0.5);
    float curve = MAX_CURVE * (2.0 * rand(seed + 4.5, n) - 1.0);
    float phase = TAU * rand(seed + 5.5, n);
    float phase2 = TAU * rand(seed + 6.5, n);

    // walk along route to particle's pixel (or end, for its markers), stepping by one pixel along whichever axis
    // it mostly moves, so that each step lands on a new pixel
    int target = id == 0 ? 0 : id == 1 ? steps : (id - 2) / DASH * (DASH + GAP) + (id - 2) % DASH;
    vec2 pos = start;
    float s = 0.0; // distance along route
    for (int i = 0; i < MAX_STEPS; i++) {
        if (i >= target) break;
        float k = TAU * s / WAVELENGTH;
        float theta = startHeading + curve * s + MEANDER * (sin(k + phase) + 0.3 * sin(2.3 * k + phase2));
        vec2 dir = vec2(cos(theta), sin(theta));
        dir /= max(abs(dir.x), abs(dir.y));
        pos += dir;
        s += length(dir);
    }

    // when particle appears: as line is drawn past it (markers at start & end of drawing)
    float drawnAt = float(target) / DRAW_SPEED;
    bool shown = id < 2 || target > MARKER_CLEARANCE && target < steps - MARKER_CLEARANCE;
    vec2 corner = (floor(pos) - 2.0) * uFontPixel; // top-left of 5x5 quad centred on pixel
    if (!shown || time < drawnAt || avoided(corner + 2.5 * uFontPixel, AVOID_PAD)) {
        gl_Position = OFFSCREEN;
        vCell = vec2(0.0);
        vMask = 0;
        vAlpha = 0.0;
        vColor = vec3(0.0);
        return;
    }
    gl_Position = quadVertex(corner, 5.0);
    vCell = (aQuadVertPos + 1.0) * 2.5;
    vMask = id == 0 ? RING : id == 1 ? CROSS : DOT;

    // freshly drawn pixels glow brighter, settling as line moves on, & whole route fades together
    float age = time - drawnAt;
    float fade = 1.0 - smoothstep(drawTime + HOLD, drawTime + HOLD + FADE, time);
    vAlpha = uIntensity * fade * min(1.0, PEAK + NIB * exp(-age / 0.4));
    vColor = id == 1 ? MARK : INK;
}
