const PARSE_EVENT = /(?:^|[.:_])parse(?:program|module|script|function)?$/i;
const COMPILE_EVENT = /(?:^|[.:_])(?:compile|baseline|optimize)(?:code|module|script|function)?$/i;
const PARSED_FUNCTION_EVENT = /(?:^|[.:_])parsefunction$/i;
const COMPILED_FUNCTION_EVENT = /(?:^|[.:_])compile(?:code|function)$/i;
const EVALUATION_EVENTS = new Set(['EvaluateScript', 'FunctionCall', 'RunMicrotasks']);

/**
 * Summarizes JavaScript startup work from a Chromium trace captured through semantic readiness.
 * Durations are reported independently because Chromium may nest compile work inside evaluation work.
 */
export function analyzeStartupTrace(traceEvents, { includeFunctionSites = false } = {}) {
	const navigationStart = earliestTimestamp(
		traceEvents,
		(event) =>
			isNavigationStart(event) ||
			(event.name === 'TimeStamp' &&
				event.args?.data?.message === '__framework_comparison_navigation_start__')
	);
	const readyAt = earliestTimestamp(
		traceEvents,
		(event) =>
			event.name === 'TimeStamp' && event.args?.data?.message === '__framework_comparison_ready__'
	);
	const firstContentfulPaintAt = earliestTimestamp(
		traceEvents,
		(event) => event.name.toLowerCase() === 'firstcontentfulpaint'
	);
	const start = navigationStart ?? minimumTimestamp(traceEvents);
	const end = readyAt ?? maximumTimestamp(traceEvents);
	const totals = { parseMs: 0, compileMs: 0, evaluationMs: 0 };
	const beforeFcp = { parseMs: 0, compileMs: 0, evaluationMs: 0 };
	const functionCounts = { parsed: 0, compiled: 0 };
	const functionCountsBeforeFcp = { parsed: 0, compiled: 0 };
	const byUrl = new Map();
	const eventDurations = new Map();
	const functionSites = [];
	const functionSiteLocations = { available: 0, unavailable: 0 };
	const scriptUrls = traceScriptUrls(traceEvents);

	for (const event of traceEvents) {
		if (event.ph !== 'X' || !Number.isFinite(event.ts) || !Number.isFinite(event.dur)) continue;
		if (event.ts < start || event.ts > end) continue;
		const field = startupField(event);
		if (!field) continue;
		const durationMs = event.dur / 1_000;
		const beforePaint =
			firstContentfulPaintAt !== undefined && event.ts + event.dur <= firstContentfulPaintAt;
		totals[field] += durationMs;
		if (beforePaint) beforeFcp[field] += durationMs;
		if (PARSED_FUNCTION_EVENT.test(event.name)) {
			functionCounts.parsed++;
			if (beforePaint) functionCountsBeforeFcp.parsed++;
		}
		if (COMPILED_FUNCTION_EVENT.test(event.name)) {
			functionCounts.compiled++;
			if (beforePaint) functionCountsBeforeFcp.compiled++;
		}
		const data = event.args?.data ?? event.args?.beginData ?? {};
		const url = traceEventUrl(event) ?? scriptUrls.get(String(data.scriptId));
		if (
			includeFunctionSites &&
			(PARSED_FUNCTION_EVENT.test(event.name) || COMPILED_FUNCTION_EVENT.test(event.name))
		) {
			const site = {
				kind: PARSED_FUNCTION_EVENT.test(event.name) ? 'parsed' : 'compiled',
				url: url ?? null,
				scriptId: data.scriptId === undefined ? null : String(data.scriptId),
				startOffset: numericPosition(data.startPosition ?? data.startOffset),
				endOffset: numericPosition(data.endPosition ?? data.endOffset),
				fields: Object.keys(data).sort()
			};
			if (site.url && site.startOffset !== null && site.endOffset !== null) {
				functionSites.push(site);
				functionSiteLocations.available++;
			} else {
				functionSiteLocations.unavailable++;
			}
		}
		if (url) {
			const entry = byUrl.get(url) ?? { parseMs: 0, compileMs: 0, evaluationMs: 0 };
			entry[field] += durationMs;
			byUrl.set(url, entry);
		}
		eventDurations.set(event.name, (eventDurations.get(event.name) ?? 0) + durationMs);
	}

	return {
		markers: {
			navigationStartFound: navigationStart !== undefined,
			firstContentfulPaintFound: firstContentfulPaintAt !== undefined,
			readyFound: readyAt !== undefined
		},
		totals,
		beforeFcp,
		functionCounts,
		functionCountsBeforeFcp,
		byUrl: rankedEntries(byUrl, 12),
		eventDurations: rankedEntries(eventDurations, 20),
		...(includeFunctionSites ? { functionSites, functionSiteLocations } : {})
	};
}

function numericPosition(value) {
	return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Returns a percentile using the nearest-rank convention used by the comparison harness. */
export function startupPercentile(values, quantile) {
	const numbers = values.filter(Number.isFinite).sort((left, right) => left - right);
	if (numbers.length === 0) return null;
	return numbers[Math.min(numbers.length - 1, Math.ceil(numbers.length * quantile) - 1)];
}

function startupField(event) {
	const name = event.name;
	const category = String(event.cat ?? '');
	if ((category.includes('v8') || /script|module|code/i.test(name)) && PARSE_EVENT.test(name))
		return 'parseMs';
	if ((category.includes('v8') || /script|module|code/i.test(name)) && COMPILE_EVENT.test(name))
		return 'compileMs';
	if (EVALUATION_EVENTS.has(name)) return 'evaluationMs';
	return undefined;
}

function isNavigationStart(event) {
	return event.name === 'navigationStart' || event.name === 'NavigationStart';
}

function earliestTimestamp(events, predicate) {
	let result;
	for (const event of events) {
		if (!Number.isFinite(event.ts) || !predicate(event)) continue;
		result = result === undefined ? event.ts : Math.min(result, event.ts);
	}
	return result;
}

function minimumTimestamp(events) {
	return earliestTimestamp(events, () => true) ?? 0;
}

function maximumTimestamp(events) {
	let result = 0;
	for (const event of events) {
		if (!Number.isFinite(event.ts)) continue;
		result = Math.max(result, event.ts + (Number.isFinite(event.dur) ? event.dur : 0));
	}
	return result;
}

function traceEventUrl(event) {
	const data = event.args?.data ?? event.args?.beginData;
	const url = data?.url ?? data?.scriptName;
	return typeof url === 'string' && /^https?:/.test(url) ? url : undefined;
}

function traceScriptUrls(events) {
	const urls = new Map();
	for (const event of events) {
		const data = event.args?.data ?? event.args?.beginData;
		const url = traceEventUrl(event);
		if (data?.scriptId !== undefined && url) urls.set(String(data.scriptId), url);
	}
	return urls;
}

function rankedEntries(entries, limit) {
	return [...entries]
		.map(([name, value]) => ({
			name,
			...(typeof value === 'number' ? { durationMs: value } : value)
		}))
		.sort(
			(left, right) =>
				(right.durationMs ?? right.parseMs + right.compileMs + right.evaluationMs) -
				(left.durationMs ?? left.parseMs + left.compileMs + left.evaluationMs)
		)
		.slice(0, limit);
}
