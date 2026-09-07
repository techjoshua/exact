/** Validates a driver plan before opening any sockets, including bounded overload controls. */
export function validateSsrLoadPlan(input) {
	const url = new URL(input.url);
	if (!['http:', 'https:'].includes(url.protocol))
		throw new TypeError('Load URL must use HTTP or HTTPS');
	if (!Array.isArray(input.stages) || !input.stages.length || input.stages.length > 100)
		throw new TypeError('Load plan requires 1–100 stages');
	const plan = {
		...input,
		url: url.href,
		maxInFlight: input.maxInFlight ?? 512,
		timeoutMs: input.timeoutMs ?? 10_000,
		maxLagMs: input.maxLagMs ?? 50,
		maxResponseBytes: input.maxResponseBytes ?? 1_048_576
	};
	for (const [name, max] of [
		['maxInFlight', 4096],
		['timeoutMs', 120_000],
		['maxLagMs', 10_000],
		['maxResponseBytes', 16_777_216]
	])
		positiveInteger(plan[name], name, max);
	const names = new Set();
	for (const stage of plan.stages) {
		if (typeof stage.name !== 'string' || !stage.name || names.has(stage.name))
			throw new TypeError('Stage names must be unique nonempty strings');
		names.add(stage.name);
		positiveInteger(stage.durationMs, 'durationMs', 3_600_000);
		if (stage.mode === 'concurrency')
			positiveInteger(stage.concurrency, 'concurrency', plan.maxInFlight);
		else if (stage.mode === 'arrival') {
			for (const rate of [stage.rate, stage.endRate ?? stage.rate])
				if (!Number.isFinite(rate) || rate <= 0 || rate > 100_000)
					throw new TypeError('Arrival rates must be in (0, 100000] requests/second');
		} else throw new TypeError('Stage mode must be concurrency or arrival');
	}
	return plan;
}

/** Integral of a linear arrival-rate ramp, clamped to the stage admission interval. */
export function arrivalDemand(stage, elapsedMs) {
	const seconds = Math.max(0, Math.min(stage.durationMs, elapsedMs)) / 1000;
	const slope = ((stage.endRate ?? stage.rate) - stage.rate) / (stage.durationMs / 1000);
	return stage.rate * seconds + (slope * seconds * seconds) / 2;
}

/** Scheduled offset for a zero-based arrival, independent of any response completion. */
export function arrivalOffsetMs(stage, index) {
	const slope = ((stage.endRate ?? stage.rate) - stage.rate) / (stage.durationMs / 1000);
	return slope === 0
		? (index / stage.rate) * 1000
		: ((2 * index) / (stage.rate + Math.sqrt(stage.rate ** 2 + 2 * slope * index))) * 1000;
}

/** Rejects unsupported bounds without silently coercing configuration. */
function positiveInteger(value, name, maximum) {
	if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
		throw new TypeError(`${name} must be an integer in [1, ${maximum}]`);
}
