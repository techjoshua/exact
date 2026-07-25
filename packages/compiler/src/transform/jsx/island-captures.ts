import type { ExpressionClientIslandSite } from '../../expression/contracts.js';
import type { ClientIslandCaptures } from '../../types.js';
import type { ComponentLocalInfo } from './contracts.js';

/** Selects serializable values, cloned functions, and state paths captured by one client island. */
export function clientIslandCaptures(
	site: ExpressionClientIslandSite | undefined,
	locals: ComponentLocalInfo | undefined
): ClientIslandCaptures {
	if (!site) return { values: [], functions: [] };
	return {
		values: [...site.valueCaptures],
		functions: site.functionCaptures.flatMap((name) => {
			const declaration = locals?.functions.get(name);
			return declaration ? [declaration] : [];
		}),
		stateReads: [...site.stateReads]
	};
}
