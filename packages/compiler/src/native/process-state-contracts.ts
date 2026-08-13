/** Describes one lexical alias for a component-owned state path. */
export type NativeCompilerStateAlias = Readonly<{
	component: string;
	name: string;
	path: readonly string[];
	start: number;
	length: number;
	invalidAt?: number;
}>;

/** Describes one component-state dependency discovered natively. */
export type NativeCompilerStateRead = Readonly<{
	component: string;
	path: readonly string[];
	confidence: 'exact' | 'broad';
	start: number;
	length: number;
}>;

/** Describes one task effect against component-owned state. */
export type NativeCompilerStateEffect = Readonly<{
	path: string;
	kind: 'read' | 'write';
	confidence: 'exact' | 'broad' | 'unknown';
	operation?: 'map' | 'set';
	receiver?:
		| Readonly<{ kind: 'component' }>
		| Readonly<{ kind: 'parameter'; index: number }>
		| Readonly<{ kind: 'unknown' }>;
}>;
