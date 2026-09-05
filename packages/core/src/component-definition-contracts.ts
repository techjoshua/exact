/** Optional runtime capability made reachable by one compiled component definition. */
export type ExactCompiledComponentCapability =
	| 'tasks'
	| 'continuations'
	| 'resumption'
	| 'inspection'
	| 'registry'
	| 'enhancements'
	| 'interactions'
	| 'compatibility'
	| 'dynamic-components'
	| 'collections'
	| 'contexts'
	| 'targets';

/** Ordinary component update program whose operations fit in two inline mask words. */
export type ExactNarrowComponentUpdateContract = Readonly<{
	/** Stable component storage slot plus its low/high operation masks. */
	bindings: readonly (readonly [slot: number, dirtyLow: number, dirtyHigh: number])[];
	/** Number of leading bindings backed by props; absent state-only artifacts import a lean lane. */
	props?: number;
	words?: never;
	/** Applies compiler-selected operations to the currently mounted finite-region targets. */
	apply(targets: readonly (object | undefined)[], dirtyLow: number, dirtyHigh: number): void;
}>;

/** Large component update program with compiler-sized mask storage beyond its inline words. */
export type ExactWideComponentUpdateContract = Readonly<{
	/** Stable component storage slot plus every 32-operation mask affected by that field. */
	bindings: readonly (readonly [
		slot: number,
		dirtyLow: number,
		dirtyHigh: number,
		dirtyWord0: number,
		...dirtyWords: number[]
	])[];
	/** Number of leading bindings backed by props; absent state-only artifacts import a lean lane. */
	props?: number;
	/** Total mask words; wide artifacts always contain at least three. */
	words: number;
	/** Applies compiler-selected operations to the currently mounted finite-region targets. */
	apply(
		targets: readonly (object | undefined)[],
		dirtyLow: number,
		dirtyHigh: number,
		dirtyWords: Uint32Array
	): void;
}>;

/** One component-owned direct DOM update program shared by every instance of its definition. */
export type ExactCompiledComponentUpdateContract =
	| ExactNarrowComponentUpdateContract
	| ExactWideComponentUpdateContract;

/** Receiver-owned prop-to-state operations proven to depend on top-level indexed prop slots. */
export type ExactCompiledComponentInputUpdateContract = Readonly<{
	/** Stable prop slot plus its low/high operation masks. */
	bindings: readonly (readonly [slot: number, dirtyLow: number, dirtyHigh: number])[];
	/** Applies finalized prop inputs to the receiving durable component state. */
	apply(
		instance: Readonly<{ state: object; props: object }>,
		dirtyLow: number,
		dirtyHigh: number
	): void;
}>;
