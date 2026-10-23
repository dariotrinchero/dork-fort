/**
 * Compile-time parser turning the QR code SVG (as drawn in Inkscape) into compact module data.
 *
 * The SVG is expected to have a square viewBox with one unit per module, a background layer containing a
 * rectangle filled with the background colour, & a main layer containing (possibly nested) labelled groups
 * of 1×1 rectangles, one per coloured module. Other layers are ignored.
 */

const MAIN_LAYER = "Main";
const BACKGROUND_LAYER = "Background";

const TAG = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
const ATTR = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
const FILL = /(?:^|;)\s*fill\s*:\s*([^;]+)/;

const parseAttrs = str => Object.fromEntries([ ...str.matchAll(ATTR) ].map(([ , name, value ]) => [ name, value ]));

const parseHex = (fill, context) => {
    const hex = fill?.trim().match(/^#([0-9a-f]{6})$/i)?.[1];
    if (!hex) throw new Error(`QR SVG: ${context} has unsupported fill "${fill}" (expected #rrggbb)`);
    return hex.toLowerCase();
};

const parseWhole = (value, context) => {
    const num = Number(value);
    if (!Number.isInteger(num)) throw new Error(`QR SVG: ${context} is not a whole number (got "${value}")`);
    return num;
};

/**
 * Parse QR code SVG source into module data.
 *
 * @param svg source code of SVG
 * @returns {{ size: number, background: string, groups: string[][], modules: [number, number, string, number][] }}
 *          size of QR code in modules, background colour (hex, without '#'), label path of each group of
 *          modules, & list of [x, y, colour, group index] for each coloured module
 */
export const bakeQR = svg => {
    const stack = []; // currently open elements
    const groups = [];
    const groupIndices = new Map();
    const modules = new Map(); // keyed by module index (y * size + x), to detect overlaps
    let size, background;

    for (const [ , closing, tag, attrStr, selfClosing ] of svg.matchAll(TAG)) {
        if (closing) {
            stack.pop();
            continue;
        }

        const attrs = parseAttrs(attrStr);
        const el = {
            fill: attrs.style?.match(FILL)?.[1] ?? attrs.fill ?? stack.at(-1)?.fill, // fill is inherited
            label: attrs[ "inkscape:label" ] ?? attrs.id ?? tag,
            tag,
        };
        const layer = stack[ 1 ]?.label;

        if (tag === "svg") {
            const [ x, y, w, h ] = (attrs.viewBox ?? "").trim().split(/[\s,]+/).map(Number);
            if (x !== 0 || y !== 0 || w !== h || !Number.isInteger(w)) {
                throw new Error(`QR SVG: viewBox must be square, start at 0 0, & have one unit per module`);
            }
            size = w;
        } else if (layer === MAIN_LAYER || (stack.length === 1 && el.label === MAIN_LAYER)) {
            if (attrs.transform) throw new Error(`QR SVG: transform on "${el.label}" in main layer is unsupported`);
        }

        if (tag === "rect" && layer === BACKGROUND_LAYER) {
            background = parseHex(el.fill, "background rectangle");
        } else if (tag === "rect" && layer === MAIN_LAYER) {
            const path = stack.slice(2).map(({ label }) => label);
            const context = `rectangle "${attrs.id}" in group "${path.join("/")}"`;
            const color = parseHex(el.fill, context);

            const key = path.join("/");
            if (!groupIndices.has(key)) groupIndices.set(key, groups.push(path) - 1);
            const group = groupIndices.get(key);

            // expand rectangle into the modules it covers
            const [ x0, y0, w, h ] = [ "x", "y", "width", "height" ].map(name => parseWhole(attrs[ name ], `${name} of ${context}`));
            for (let y = y0; y < y0 + h; y++) {
                for (let x = x0; x < x0 + w; x++) {
                    if (x < 0 || y < 0 || x >= size || y >= size) throw new Error(`QR SVG: ${context} lies outside viewBox`);
                    if (modules.has(y * size + x)) throw new Error(`QR SVG: ${context} overlaps another module at (${x}, ${y})`);
                    modules.set(y * size + x, [ x, y, color, group ]);
                }
            }
        }

        if (!selfClosing) stack.push(el);
    }

    if (size === undefined) throw new Error("QR SVG: missing <svg> element");
    if (background === undefined) throw new Error(`QR SVG: missing rectangle in layer "${BACKGROUND_LAYER}"`);
    if (modules.size === 0) throw new Error(`QR SVG: no modules found in layer "${MAIN_LAYER}"`);
    if (groups.length > 254) throw new Error("QR SVG: too many groups (at most 254 supported)");

    return { background, groups, modules: [ ...modules.values() ], size };
};
