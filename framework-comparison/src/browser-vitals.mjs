/** Installs buffered, participant-neutral startup observers before application code executes. */
export function installBrowserVitals() {
	const state = { largestContentfulPaintMs: null, longTasks: [] };
	globalThis.__frameworkComparisonVitals = state;
	try {
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) state.largestContentfulPaintMs = entry.startTime;
		}).observe({ type: 'largest-contentful-paint', buffered: true });
	} catch {
		// Unsupported entry types remain explicitly null in the recorded sample.
	}
	try {
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries())
				state.longTasks.push({ startTimeMs: entry.startTime, durationMs: entry.duration });
		}).observe({ type: 'longtask', buffered: true });
	} catch {
		// Unsupported entry types remain an empty collection in the recorded sample.
	}
}

/** Snapshots browser-observed startup vitals at the suite's semantic readiness boundary. */
export function readBrowserVitals() {
	const state = globalThis.__frameworkComparisonVitals ?? {
		largestContentfulPaintMs: null,
		longTasks: []
	};
	const longTasks = state.longTasks.filter((entry) => entry.startTimeMs <= performance.now());
	// Keep this census inside the exported callback. Playwright serializes `readBrowserVitals` into
	// the page without its module closure, so references to module-local helpers cannot survive.
	let domNodeCount = 0;
	let domCommentCount = 0;
	let domTextCount = 0;
	const walker = document.createTreeWalker(document, NodeFilter.SHOW_ALL);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		domNodeCount++;
		if (node.nodeType === Node.COMMENT_NODE) domCommentCount++;
		else if (node.nodeType === Node.TEXT_NODE) domTextCount++;
	}
	return {
		largestContentfulPaintMs: state.largestContentfulPaintMs,
		longTaskCount: longTasks.length,
		longTaskDurationMs: longTasks.reduce((sum, entry) => sum + entry.durationMs, 0),
		totalBlockingTimeMs: longTasks.reduce(
			(sum, entry) => sum + Math.max(0, entry.durationMs - 50),
			0
		),
		domElementCount: document.getElementsByTagName('*').length,
		domNodeCount,
		domCommentCount,
		domTextCount
	};
}
