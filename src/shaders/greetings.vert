#version 300 es

#include "particles.glsl"
#include "glyphs.glsl"
// particles of SLOTS greetings, by instance: for each (MAX_CHARS + 1 apiece), its characters, then its cursor; seeds
// are unused, as all particles of a greeting share its timing & place; string 0 is the cursor, & the rest greetings

uniform vec4 uText; // region where text is shown, kept clear of greetings: left, top, right, & bottom, in pixels

out vec2 vUV;
out float vAlpha;
out vec3 vColor;

// parameters
const int SLOTS = 3;            // greetings shown at once (at most), a third of a cycle apart
const int MAX_CHARS = 8;        // longest greeting (matching count in particles.ts)
const float PERIOD = 10.0;      // seconds between starts of greetings in the same slot, less random delay
const float MAX_DELAY = 3.0;    // longest random delay before greeting starts, in seconds
const float PAUSE = 0.6;        // seconds for which cursor waits before typing starts
const float CHAR_TIME = 0.15;   // mean seconds between typed characters
const float HOLD = 2.5;         // seconds for which greeting lingers once typed
const float FADE = 1.0;         // seconds over which greeting fades
const float BLINK = 0.5;        // seconds for which cursor is alternately shown & hidden, once typing is done
const int TRIES = 4;            // places tried for greeting, before skipping its turn
const float MARGIN = 3.0;       // least distance of greeting from edges of screen, in characters
const float CLEARANCE = 1.0;    // least distance of greeting from text & icon, in characters
const float PEAK = 0.25;        // alpha of greeting

const vec3 INK = vec3(0.95, 0.85, 0.5);

// whether given rectangles (left, top, right, & bottom) overlap
bool overlaps(vec4 a, vec4 b) {
    return a.x < b.z && b.x < a.z && a.y < b.w && b.y < a.w;
}

void hide() {
    gl_Position = OFFSCREEN;
    vUV = vec2(0.0);
    vAlpha = 0.0;
    vColor = vec3(0.0);
}

void main() {
    // progress through current cycle of particle's greeting (each cycle a new greeting, in a new place)
    int slot = gl_InstanceID / (MAX_CHARS + 1);
    int k = gl_InstanceID % (MAX_CHARS + 1); // character of greeting (MAX_CHARS being its cursor)
    float seed = 10.0 * float(slot);
    float cycles = uTime / PERIOD + float(slot) / float(SLOTS);
    float n = floor(cycles);
    float time = fract(cycles) * PERIOD - MAX_DELAY * rand(seed + 0.5, n);

    int greeting = 1 + int(min(uStringCount - 2.0, floor(rand(seed + 1.5, n) * (uStringCount - 1.0))));
    int chars = stringLength(greeting);

    // times at which characters are typed, at an uneven pace
    float typed = 0.0; // characters typed by now
    float typedAt = PAUSE; // when last character is typed
    for (int i = 0; i < MAX_CHARS; i++) {
        if (i >= chars) break;
        if (time >= typedAt) typed++;
        typedAt += CHAR_TIME * (0.4 + 1.2 * rand(seed + 2.5 + float(i), n));
    }
    float doneAt = typedAt; // typing is done (after last character, as if moving on)
    float fadeAt = doneAt + HOLD;
    bool cursor = k == MAX_CHARS;
    if (time < 0.0 || time > fadeAt + FADE || (!cursor && float(k) >= typed)) {
        hide();
        return;
    }

    // cursor is shown from start until greeting fades, solidly while typing, & then blinking
    if (cursor && (time > fadeAt || time > doneAt && mod(floor((time - doneAt) / BLINK), 2.0) > 0.5)) {
        hide();
        return;
    }

    // place: first of a few random spots clear of text, icon, & edges of screen (else greeting skips its turn)
    vec2 size = vec2(float(chars + 1), 1.0) * uGlyphSize;
    vec2 margin = MARGIN * uGlyphSize;
    vec4 clear = vec4(-CLEARANCE * uGlyphSize, CLEARANCE * uGlyphSize);
    vec2 corner = vec2(-1.0);
    for (int i = 0; i < TRIES; i++) {
        vec2 r = vec2(rand(seed + 3.5 + float(i), n), rand(seed + 4.5 + float(i), n));
        vec2 candidate = floor((margin + r * (uResolution - 2.0 * margin - size)) / uFontPixel) * uFontPixel;
        vec4 box = vec4(candidate, candidate + size);
        if (!overlaps(box, uText + clear) && !overlaps(box, uAvoid + clear)) {
            corner = candidate;
            break;
        }
    }
    if (corner.x < 0.0) {
        hide();
        return;
    }

    // character (or cursor, after characters typed so far)
    vec2 cell = corner + vec2(cursor ? typed : float(k), 0.0) * uGlyphSize;
    vec2 clipPos = (cell + (aQuadVertPos + 1.0) * 0.5 * uGlyphSize) / uResolution * 2.0 - 1.0;
    gl_Position = vec4(clipPos.x, -clipPos.y, 0.0, 1.0);
    vUV = glyphUV(glyphAt(cursor ? 0 : greeting, cursor ? 0 : k));

    vAlpha = uIntensity * PEAK * (1.0 - smoothstep(fadeAt, fadeAt + FADE, time));
    vColor = INK;
}
