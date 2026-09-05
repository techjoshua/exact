/** Existential executable retained by compiler contracts without inspecting parameters or result. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generated component implementations have heterogeneous callable signatures that are preserved by identity.
export type AnyExactComponentCallable = (...args: any[]) => any;

/** Build-selected allocation record retained only when a runtime target consumes it. */
export type ExactComponentReactiveAllocation = Readonly<{
	name: string;
	provenance: 'state' | 'props' | 'context' | 'derived' | 'cell' | 'snapshot' | 'unknown';
	allocation: 'constant' | 'live-slot' | 'inline' | 'computed' | 'snapshot' | 'structural';
	dependencies: readonly string[];
}>;
