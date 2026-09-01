/** Validates target-local server execution metadata without evaluating attached functions. */
export function isExactServerExecutionMetadata(value: unknown, selection = false): boolean {
	if (!record(value)) return false;
	const allowed = new Set([
		'version',
		'classification',
		'lane',
		'deferredTaskProps',
		'render',
		'mode',
		'frame',
		'lifecycle',
		'publication'
	]);
	if (Object.keys(value).some((key) => !allowed.has(key))) return false;
	const lane = value.lane;
	const direct = lane === 'direct';
	return (
		value.version === 1 &&
		(value.classification === 'synchronous' ||
			value.classification === 'scheduled' ||
			value.classification === 'dynamic') &&
		(direct || lane === 'generic' || lane === 'compatibility') &&
		(value.deferredTaskProps === undefined || stringList(value.deferredTaskProps)) &&
		(value.mode === undefined ||
			((value.mode === 'direct' || value.mode === 'stateless') &&
				direct &&
				value.classification === 'synchronous' &&
				!selection)) &&
		(value.frame === undefined || (direct && typeof value.frame === 'function')) &&
		(value.lifecycle === undefined || validLifecycle(value.lifecycle, direct)) &&
		(value.publication === undefined || validPublication(value.publication)) &&
		(direct
			? value.classification !== 'dynamic' &&
				(selection ? value.render === undefined : typeof value.render === 'function')
			: value.render === undefined)
	);
}

function validLifecycle(value: unknown, direct: boolean): boolean {
	return (
		direct &&
		record(value) &&
		Object.keys(value).every((key) => key === 'rendered' || key === 'dispose') &&
		typeof value.rendered === 'function' &&
		typeof value.dispose === 'function'
	);
}

function validPublication(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).every((key) => key === 'kind' || key === 'name') &&
		value.kind === 'resumption' &&
		typeof value.name === 'string' &&
		value.name.length > 0 &&
		!value.name.includes('\0')
	);
}

function stringList(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.every((entry) => typeof entry === 'string' && !entry.includes('\0'))
	);
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
