export interface Destination {
    group: string;  // label path prefix of group(s) in QR code SVG, eg. "garden" or "garden/tulip"
    name: string;   // name of destination, as displayed; text in braces is shown in accent colour, eg. "ls {garden}"
    color?: string; // accent colour (hex, without leading '#'), before hover boost; average of group(s) if omitted
}
