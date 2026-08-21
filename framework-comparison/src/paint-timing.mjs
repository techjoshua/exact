/** Waits for Chromium to publish a buffered FCP entry without racing paint-entry delivery. */
export function waitForFirstContentfulPaint() {
	// This function is serialized into the participant page, so keep its reader closure self-contained.
	const read = () => {
		const entry = performance.getEntriesByName('first-contentful-paint')[0];
		return entry && Number.isFinite(entry.startTime) ? entry.startTime : undefined;
	};
	const existing = read();
	if (existing !== undefined) return Promise.resolve(existing);
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			observer.disconnect();
			resolve(value);
		};
		const observer = new PerformanceObserver(() => {
			const value = read();
			if (value !== undefined) finish(value);
		});
		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			observer.disconnect();
			reject(new Error('First contentful paint was not observed within 2 seconds'));
		}, 2_000);
		observer.observe({ type: 'paint', buffered: true });
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				const value = read();
				if (value !== undefined) finish(value);
			})
		);
	});
}
