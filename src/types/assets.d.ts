// ambient declarations required for asset file imports

declare module "*.svg" { // QR code SVGs are baked into module data at compile time
	import type { QRData } from "types/qrRenderer";
	const value: QRData;
	export default value;
}
