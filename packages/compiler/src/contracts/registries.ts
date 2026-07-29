import type { ExactPlacement } from './policy.js';

/** One finite eager or lazy component target owned by a registry declaration. */
export type ExactComponentRegistryEntryIR = {
	key: string;
	mode: 'eager' | 'lazy';
	componentId: string;
	componentName: string;
	placement: ExactPlacement;
	moduleSpecifier?: string;
	exportName?: string;
	ownership: 'exact' | 'react-compat';
	artifactTargets: Array<'client' | 'server'>;
};

/** Compiler-owned identity and finite entry graph for one component registry. */
export type ExactComponentRegistryIR = {
	id: string;
	name: string;
	entries: ExactComponentRegistryEntryIR[];
};
