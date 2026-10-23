import type { Destination } from "types/destinations";

// destinations reachable from QR code, keyed to groups in QR code SVG (see src/assets/qr.svg)
const DESTINATIONS: Destination[] = [
    { color: "739326", group: "hooded-rat", name: "cat {traveller}" },
    { group: "chicken", name: "ping {companion}" },
    { color: "f95f16", group: "campfire", name: "touch {campfire}" },
    { color: "fe86c6", group: "garden", name: "ls {garden}" },
    { group: "moon", name: "sort {moon-and-stars}" },
    { group: "nametag", name: "{whoami}" },
    { group: "mysterious-boxes", name: "ssh {realm-of-forms}" },
];

export default DESTINATIONS;
