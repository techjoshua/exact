/** Removes execution fields and, when requested, version identity from compiler output. */
export function normalizeNativeCompilerResponse(response, ignoreVersions = false) {
	const output = { ...response };
	delete output.timings;
	delete output.counters;
	delete output.cacheHit;
	if (ignoreVersions) {
		delete output.protocolVersion;
		delete output.backendVersion;
		delete output.typescriptVersion;
	}
	return output;
}

/** Returns the first structural difference between two JSON-compatible values. */
export function firstNativeCompilerDifference(before, after, location = '$') {
	if (Object.is(before, after)) return undefined;
	if (typeof before !== typeof after || before === null || after === null)
		return { location, before, after };
	if (Array.isArray(before) || Array.isArray(after)) {
		if (!Array.isArray(before) || !Array.isArray(after)) return { location, before, after };
		if (before.length !== after.length)
			return {
				location: `${location}.length`,
				before: before.length,
				after: after.length
			};
		for (let index = 0; index < before.length; index++) {
			const difference = firstNativeCompilerDifference(
				before[index],
				after[index],
				`${location}[${index}]`
			);
			if (difference) return difference;
		}
		return undefined;
	}
	if (typeof before !== 'object') return { location, before, after };
	const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
	for (const key of keys) {
		if (!Object.hasOwn(before, key) || !Object.hasOwn(after, key))
			return { location: `${location}.${key}`, before: before[key], after: after[key] };
		const difference = firstNativeCompilerDifference(before[key], after[key], `${location}.${key}`);
		if (difference) return difference;
	}
	return undefined;
}
