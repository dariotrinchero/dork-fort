import type { ParticleEffect } from "types/particles";
import type { Region } from "types/qrRenderer";

// destination, with its region of QR code SVG (& icon, shown above its output; eg. "garden/tulip")
export interface Destination extends Region {
    name: string;       // command navigating to destination; text in braces names it, & is shown in accent colour,
                        // eg. "ls {garden}"
    color: string;      // accent colour (hex, without leading '#'), before hover boost
    aliases?: string[]; // other names, which also navigate to destination when entered as commands, eg. "travel"
    sound?: string;     // URL of looping sound, faded in while destination is shown, eg. "sounds/garden.mp3"
    volume?: number;    // volume of sound, relative to that of others (1 if omitted)
    particles?: ParticleEffect; // particle effect, faded in while destination is shown
}
