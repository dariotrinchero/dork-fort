// ambient declarations required for shader file imports

declare module "*.frag" {
	const value: string;
	export default value;
}

declare module "*.vert" {
	const value: string;
	export default value;
}
