const requiredMarkers = Object.freeze([
	'REACTIVE_BENCHMARK_JSON',
	'DOM_LIST_BENCHMARK_JSON',
	'EXACT_FRAMEWORK_BENCHMARK_JSON',
	'COMPILER_BENCHMARK_JSON',
	'THEME_BENCHMARK_JSON',
	'DEVTOOLS_BENCHMARK_JSON',
	'REACT_COMPAT_BENCHMARK_JSON'
]);

/** Extracts the complete internal performance matrix from a captured performance release run. */
export function readComponentLocalTargetAbiPerformanceOutput(raw) {
	if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.phases))
		throw new Error('component-local target ABI performance output is malformed');
	const markers = {};
	for (const phase of raw.phases) {
		if (typeof phase?.output !== 'string')
			throw new Error('performance phase omitted captured standard output');
		for (const line of phase.output.split(/\r?\n/)) {
			const separator = line.indexOf('=');
			if (separator <= 0) continue;
			const name = line.slice(0, separator);
			if (!requiredMarkers.includes(name)) continue;
			if (markers[name]) throw new Error(`performance output repeated ${name}`);
			try {
				markers[name] = JSON.parse(line.slice(separator + 1));
			} catch (error) {
				throw new Error(`performance output contains malformed ${name}`, { cause: error });
			}
		}
	}
	const missing = requiredMarkers.filter((name) => markers[name] === undefined);
	if (missing.length)
		throw new Error(`performance output omitted required results: ${missing.join(', ')}`);
	return Object.freeze(markers);
}
