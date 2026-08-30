/** Summarizes a V8 sampling CPU profile without discarding the raw profile used for later analysis. */
export function summarizeCpuProfile(profile, limit = 30) {
	const nodes = new Map((profile.nodes ?? []).map((node) => [node.id, node]));
	const sites = new Map();
	const samples = profile.samples ?? [];
	const deltas = profile.timeDeltas ?? [];
	for (let index = 0; index < samples.length; index += 1) {
		const node = nodes.get(samples[index]);
		if (!node) continue;
		const site = profileSite(node.callFrame);
		const key = profileSiteKey(site);
		const entry = sites.get(key) ?? { ...site, samples: 0, sampledMs: 0 };
		entry.samples += 1;
		entry.sampledMs += (deltas[index] ?? 0) / 1_000;
		sites.set(key, entry);
	}
	return {
		durationMs:
			Number.isFinite(profile.startTime) && Number.isFinite(profile.endTime)
				? (profile.endTime - profile.startTime) / 1_000
				: null,
		totalSamples: samples.length,
		topSites: rankedSites(sites.values(), (entry) => entry.sampledMs, limit),
		byUrl: groupSitesByUrl(sites.values(), 'sampledMs', limit)
	};
}

/** Summarizes sampled live allocations by their JavaScript allocation site. */
export function summarizeHeapSamplingProfile(profile, limit = 30) {
	const sites = new Map();
	const visit = (node) => {
		if (!node) return;
		const site = profileSite(node.callFrame);
		const key = profileSiteKey(site);
		const entry = sites.get(key) ?? { ...site, sampledBytes: 0, nodes: 0 };
		entry.sampledBytes += node.selfSize ?? 0;
		entry.nodes += 1;
		sites.set(key, entry);
		for (const child of node.children ?? []) visit(child);
	};
	visit(profile.head);
	return {
		sampledBytes: [...sites.values()].reduce((sum, entry) => sum + entry.sampledBytes, 0),
		sampleCount: profile.samples?.length ?? 0,
		topSites: rankedSites(sites.values(), (entry) => entry.sampledBytes, limit),
		byUrl: groupSitesByUrl(sites.values(), 'sampledBytes', limit)
	};
}

/** Aggregates optional framework phase events while retaining their original event population. */
export function summarizeFrameworkProfileEvents(events) {
	const phases = new Map();
	for (const event of events ?? []) {
		if (
			!event ||
			typeof event.subsystem !== 'string' ||
			typeof event.phase !== 'string' ||
			!Number.isFinite(event.elapsedMs)
		)
			continue;
		const key = `${event.subsystem}\0${event.phase}`;
		const current = phases.get(key) ?? {
			subsystem: event.subsystem,
			phase: event.phase,
			elapsedMs: 0,
			events: 0
		};
		current.elapsedMs += event.elapsedMs;
		current.events++;
		phases.set(key, current);
	}
	return [...phases.values()].sort((left, right) => right.elapsedMs - left.elapsedMs);
}

function profileSite(callFrame = {}) {
	return {
		functionName: callFrame.functionName || '(anonymous)',
		url: callFrame.url || '(native)',
		lineNumber: Number.isSafeInteger(callFrame.lineNumber) ? callFrame.lineNumber : -1,
		columnNumber: Number.isSafeInteger(callFrame.columnNumber) ? callFrame.columnNumber : -1
	};
}

function profileSiteKey(site) {
	return `${site.url}\u0000${site.lineNumber}\u0000${site.columnNumber}\u0000${site.functionName}`;
}

function rankedSites(values, score, limit) {
	return [...values]
		.filter((entry) => score(entry) > 0)
		.sort((left, right) => score(right) - score(left))
		.slice(0, limit);
}

function groupSitesByUrl(values, field, limit) {
	const urls = new Map();
	for (const entry of values) urls.set(entry.url, (urls.get(entry.url) ?? 0) + entry[field]);
	return [...urls]
		.map(([url, value]) => ({ url, [field]: value }))
		.filter((entry) => entry[field] > 0)
		.sort((left, right) => right[field] - left[field])
		.slice(0, limit);
}
