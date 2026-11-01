/** Verifies ordinary context-pair aliases and the identities of previously held token views. */
export function verifyReactContextObservations(
	api: Pick<
		typeof import('../../react-compat/src/interop.js'),
		'defineInteropContext' | 'bridgeReactContext' | 'exactContextToken'
	> & {
		createContext: typeof import('@exactjs/core').createContext;
	}
): true;
