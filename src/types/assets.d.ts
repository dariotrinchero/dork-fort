// ambient declarations required for asset file imports

declare const MEDIA_URL: string; // root URL of media/ (eg. sounds), defined at compile time by scripts/build.js

declare module "*.svg" { // QR code SVGs are baked into module data at compile time
	import type { QRData } from "types/qrRenderer";
	const value: QRData;
	export default value;
}

// frontmatter of notes in folders of content vault is baked into module data at compile time

declare module "content/novels" {
	import type { Novel } from "types/content";
	const value: Novel[];
	export default value;
}

declare module "content/films" {
	import type { Film } from "types/content";
	const value: Film[];
	export default value;
}

declare module "content/games" {
	import type { Game } from "types/content";
	const value: Game[];
	export default value;
}

declare module "content/boardgames" {
	import type { BoardGame } from "types/content";
	const value: BoardGame[];
	export default value;
}

declare module "content/pages" {
	import type { Page } from "types/content";
	const value: Page[];
	export default value;
}
