/** Installs scenario readiness and native interaction timing before application scripts execute. */
export function installBrowserExperience() {
	const state = { serviceReadyMs: null, interactions: [], observers: [] };
	globalThis.__frameworkComparisonExperience = state;
	const readiness = new MutationObserver(() => {
		if (!document.querySelector('.connection')?.textContent?.includes('Live service')) return;
		state.serviceReadyMs = performance.now();
		readiness.disconnect();
	});
	readiness.observe(document, { childList: true, characterData: true, subtree: true });
	for (const type of ['event', 'first-input']) {
		const observer = new PerformanceObserver((list) =>
			state.interactions.push(...list.getEntries())
		);
		observer.observe({
			type,
			buffered: true,
			...(type === 'event' ? { durationThreshold: 16 } : {})
		});
		state.observers.push(observer);
	}
}

/** Reads the first trusted interaction's browser-reported duration, including its presentation delay. */
export function readBrowserExperience() {
	const state = globalThis.__frameworkComparisonExperience;
	if (!state) throw new Error('Browser experience observer was not installed');
	for (const observer of state.observers) state.interactions.push(...observer.takeRecords());
	const first = state.interactions.find((entry) => entry.entryType === 'first-input');
	if (!first?.interactionId) throw new Error('Browser did not report the first interaction');
	return {
		serviceReadyMs: state.serviceReadyMs,
		interactionDurationMs: Math.max(
			...state.interactions
				.filter((entry) => entry.interactionId === first.interactionId)
				.map((entry) => entry.duration)
		)
	};
}
