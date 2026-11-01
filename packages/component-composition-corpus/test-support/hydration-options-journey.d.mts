import type { createCompiledComponentOperation } from '../../dom/src/test-support/native-operations.js';
import type { hydrate } from '../../hydrate/src/root.js';
/** Checks initial adoption, inherited callback receivers, retained updates, live aliases and cleanup. */
export function verifyHydrationOptions(api: {
	Panel: Parameters<typeof createCompiledComponentOperation>[0];
	operation: typeof createCompiledComponentOperation;
	hydrate: typeof hydrate;
}): Promise<true>;
