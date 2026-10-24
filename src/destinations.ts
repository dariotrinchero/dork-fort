import type { Destination } from "types/destinations";

// destinations reachable from QR code, keyed to groups in QR code SVG (see src/assets/qr.svg)
const DESTINATIONS: Destination[] = [
    { color: "739326", group: "hooded-rat", name: "cat {traveller}" },
    { color: "fabb3f", group: "chicken", name: "ping {companion}" },
    { color: "f95f16", group: "campfire", name: "touch {campfire}" },
    { color: "c0709e", group: "garden", name: "ls {garden}" },
    { color: "f0cc66", group: "moon", name: "sort {moon-and-stars}" },
    { color: "3aa49e", group: "nametag", name: "{whoami}" },
    { color: "887a96", group: "mysterious-boxes", name: "ssh {realm-of-forms}" },
];

export default DESTINATIONS;
