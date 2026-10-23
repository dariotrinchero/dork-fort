import type { Destination } from "types/destinations";

// destinations reachable from QR code, keyed to groups in QR code SVG (see src/assets/qr.svg)
const DESTINATIONS: Destination[] = [
    { group: "hooded-rat", name: "traveller" },
    { group: "chicken", name: "companion" },
    { group: "campfire", name: "campfire" },
    { group: "garden", name: "garden" },
    { group: "moon", name: "moon" },
    { group: "nametag", name: "home" },
    { group: "mysterious-boxes", name: "floating symbols" },
];

export default DESTINATIONS;
