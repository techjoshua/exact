/** Installs buffered, participant-neutral startup observers before application code executes. */
export function installBrowserVitals() {
	const state = { largestContentfulPaintMs: null, longTasks: [], shifts: [], observers: [] };
	globalThis.__frameworkComparisonVitals = state;
	try {
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) state.largestContentfulPaintMs = entry.startTime;
		});
		observer.observe({ type: 'largest-contentful-paint', buffered: true });
		state.observers.push([observer, 'lcp']);
	} catch {
		// Unsupported entry types remain explicitly null in the recorded sample.
	}
	try {
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries())
				state.longTasks.push({ startTimeMs: entry.startTime, durationMs: entry.duration });
		});
		observer.observe({ type: 'longtask', buffered: true });
		state.observers.push([observer, 'task']);
	} catch {
		// Unsupported entry types remain an empty collection in the recorded sample.
	}
	const shifts = new PerformanceObserver((list) => state.shifts.push(...list.getEntries()));
	shifts.observe({ type: 'layout-shift', buffered: true });
	state.observers.push([shifts, 'shift']);
}

/** Snapshots browser-observed startup vitals at the suite's semantic readiness boundary. */
export function readBrowserVitals() {
	const state = globalThis.__frameworkComparisonVitals ?? {
		largestContentfulPaintMs: null,
		longTasks: [],
		shifts: [],
		observers: []
	};
	for (const [observer, kind] of state.observers) {
		for (const entry of observer.takeRecords()) {
			if (kind === 'lcp') state.largestContentfulPaintMs = entry.startTime;
			else if (kind === 'shift') state.shifts.push(entry);
			else state.longTasks.push({ startTimeMs: entry.startTime, durationMs: entry.duration });
		}
	}
	let windowStart = -Infinity,
		lastShift = -Infinity,
		windowScore = 0,
		cls = 0;
	for (const entry of state.shifts) {
		if (entry.hadRecentInput) continue;
		if (entry.startTime - lastShift >= 1000 || entry.startTime - windowStart >= 5000) {
			windowStart = entry.startTime;
			windowScore = 0;
		}
		windowScore += entry.value;
		lastShift = entry.startTime;
		cls = Math.max(cls, windowScore);
	}
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
		cumulativeLayoutShift: cls,
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
