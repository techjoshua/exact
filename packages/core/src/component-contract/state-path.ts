/** Runtime-neutral state path used by a generated continuation contract. */
export type ExactContinuationStatePathContract = Readonly<{
	path: string;
	kind: 'read' | 'write';
	confidence: 'exact' | 'broad' | 'unknown';
	operation?: 'value' | 'map' | 'set';
	/** Exact typed Array prefixes, independently of read and write authority. */
	arrayRoots?: readonly ExactArrayRootProof[];
}>;

/** A finite checker-owned Array prefix relative to the effect receiver. */
export type ExactArrayRootProof = Readonly<{
	kind: 'array';
	path: readonly string[];
	confidence: 'exact';
}>;
