/** Checks ordinary writable aliases without changing another render's preload metadata. */
export function verifySsrResultLinks(api) {
	const input = ['asset'];
	const first = api.createChunkedStringResult(['first'], undefined, undefined, input);
	first.preloadLinks.push('local');
	const second = api.createChunkedStringResult(['second'], undefined, undefined, input);
	if (input.join() !== 'asset' || second.preloadLinks.join() !== 'asset')
		throw new Error('SSR preload metadata escaped its result owner');
	const hydrated = api.createChunkedHydratableResult(first, [], 'hydrate');
	hydrated.preloadLinks.push('hydrated');
	if (!hydrated.preloadLinks.includes('hydrated') || second.preloadLinks.includes('hydrated'))
		throw new Error('SSR hydration metadata changed another result');
	return true;
}

/** Checks that response-owned hydration field names do not expose the cached schema. */
export function verifySsrHydrationObservations(api) {
	const first = new api.SsrHydrationTable();
	first.add('ObservationPanel', 'ssr-result-observation', { title: 'first' });
	const names = first.value()[1][0][1];
	names[0] = 'local';
	names.push('annotation');
	first.add('ObservationPanel', 'ssr-result-observation', { title: 'same-response' });
	if (first.value()[1][0][2][1][1] !== 'same-response')
		throw new Error('SSR response metadata changed private field selection');
	const second = new api.SsrHydrationTable();
	second.add('ObservationPanel', 'ssr-result-observation', { title: 'second' });
	const group = second.value()[1][0];
	if (group[1].join() !== 'title' || group[2][0][1] !== 'second')
		throw new Error('SSR response metadata changed the cached hydration schema');
	return true;
}
