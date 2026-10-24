// module data of QR code, as baked from SVG at compile time (see scripts/bakeQR.js)

type Module = [
    number, // x (in modules, from left)
    number, // y (in modules, from top)
    string, // hex colour, without leading '#'
    number, // index into groups
];

export interface QRData {
    size: number;       // width & height in modules (including quiet zone)
    background: string; // hex colour, without leading '#'
    groups: string[][]; // label path of each group of modules, eg. ["garden", "tulip"]
    modules: Module[];  // coloured modules; all others are background
}

export interface Region {
    group: string;   // label path prefix of SVG groups forming region, eg. "garden"
    icon?: string[]; // label path prefixes of groups within region still shown while it is selected; all if omitted
}

export interface QRRendererOptions {
    bgBrightness?: number; // multiplier for background colour from SVG (0 for black); 1 if omitted
    regions?: Region[];    // interactive regions
}
