// layout of text around QR code, in pixels from top-left of output
export interface TextLayout {
    left: number;       // left edge of QR code, where text starts
    right: number;      // right edge of QR code, where text wraps
    promptTop: number;  // top of prompt, below QR code
    echoTop: number;    // top of command whose output is shown, which rises from prompt to below the destination
                        // shown (or for commands other than destinations, to top of QR code)
    paneBottom: number; // bottom of output (ie. bottom of QR code)
}
