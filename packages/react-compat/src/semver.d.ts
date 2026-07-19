declare module 'semver' {
	export type RangeOptions = { includePrerelease?: boolean };
	export function validRange(range: string): string | null;
	export function intersects(first: string, second: string, options?: RangeOptions): boolean;
	export function satisfies(version: string, range: string, options?: RangeOptions): boolean;
}
