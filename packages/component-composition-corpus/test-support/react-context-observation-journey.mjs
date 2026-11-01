/** Checks writable paired-context observations without retargeting previously held context views. */
export function verifyReactContextObservations(api) {
	const observed = api.defineInteropContext('fixture.mutable-observation', 0);
	const original = observed.react;
	const replacement = api.createContext('fixture.replacement-observation');
	observed.exact = replacement;
	observed.react = api.bridgeReactContext(replacement, 1);
	if (api.exactContextToken(observed.react) !== replacement)
		throw new Error('The replacement context view lost its native token');
	if (api.exactContextToken(original) === replacement)
		throw new Error('Editing a context observation retargeted another consumer');
	return true;
}
