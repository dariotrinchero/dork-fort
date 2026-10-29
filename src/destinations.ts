import type { Destination } from "types/destinations";

// destinations reachable from QR code, keyed to groups in QR code SVG (see src/assets/qr.svg)
const DESTINATIONS: Destination[] = [
    { // nametag
		aliases: ["about"],
		color: "3aa49e",
		group: "nametag",
		name: "{whoami}"
	},
    { // traveller
		aliases: ["travel", "adventure"],
		color: "649536",
		group: "hooded-rat",
		name: "cat {traveller}",
		sound: "sounds/traveller.mp3",
	},
    { // companion
		aliases: ["friends", "guestbook"],
		color: "a18c11",
		group: "chicken",
		name: "ping {companion}",
		sound: "sounds/companion.mp3",
	},
    { // campfire
		aliases: ["recipes", "cooking"],
		color: "f95f16",
		group: "campfire",
		name: "touch {campfire}",
		sound: "sounds/campfire.mp3",
	},
    { // moon & stars
		aliases: ["journal", "lists"],
		color: "3a6ca2",
		group: "moon",
		name: "sort {moon-and-stars}",
		sound: "sounds/moon-and-stars.mp3",
	},
    { // realm of forms
        aliases: ["blog", "math", "phil"],
        color: "7868a0",
        group: "mysterious-boxes",
        icon: ["mysterious-boxes/floating-cube1", "mysterious-boxes/floating-cube2"], // QR code's top corners only
        name: "ssh {realm-of-forms}",
        sound: "sounds/realm-of-forms.mp3",
    },
    { //garden
		aliases: ["log", "critters"],
		color: "a54e5c",
		group: "garden",
		name: "ls {garden}",
		sound: "sounds/garden.mp3",
	},
];

export default DESTINATIONS;
