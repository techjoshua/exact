/** Converts one FCP entry into explicit standard, render-completion, and presentation timestamps. */
export function firstContentfulPaintTiming(entry) {
	if (!entry) return undefined;
	return {
		startTimeMs: finiteOrNull(entry.startTime),
		paintTimeMs: finiteOrNull(entry.paintTime),
		presentationTimeMs: finiteOrNull(entry.presentationTime)
	};
}

/** Waits for Chromium to publish a buffered FCP entry without racing paint-entry delivery. */
export function waitForFirstContentfulPaint() {
	// This function is serialized into the participant page, so keep its reader closure self-contained.
	const read = () => {
		const entry = performance.getEntriesByName('first-contentful-paint')[0];
		if (!entry) return undefined;
		return {
			startTimeMs: Number.isFinite(entry.startTime) ? entry.startTime : null,
			paintTimeMs: Number.isFinite(entry.paintTime) ? entry.paintTime : null,
			presentationTimeMs: Number.isFinite(entry.presentationTime) ? entry.presentationTime : null
		};
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

/** Adds response policy headers that expose uncoarsened paint presentation timestamps. */
export async function isolatePageNavigation(page, participantUrl) {
	await page.route(`${participantUrl}/**`, async (route) => {
		if (route.request().resourceType() !== 'document') {
			await route.continue();
			return;
		}
		const response = await route.fetch();
		await route.fulfill({
			response,
			headers: {
				...response.headers(),
				'cross-origin-embedder-policy': 'require-corp',
				'cross-origin-opener-policy': 'same-origin'
			}
		});
	});
}

function finiteOrNull(value) {
	return Number.isFinite(value) ? value : null;
}
