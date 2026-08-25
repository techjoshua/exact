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
	| 'collections';

/** One component-owned direct DOM update program shared by every instance of its definition. */
export type ExactCompiledComponentUpdateContract = Readonly<{
	/** Stable state field plus the low/high operation masks affected by that field. */
	bindings: readonly (readonly [key: string, dirtyLow: number, dirtyHigh: number])[];
	/** Applies compiler-selected operations to the currently mounted finite-region targets. */
	apply(targets: readonly (object | undefined)[], dirtyLow: number, dirtyHigh: number): void;
}>;
