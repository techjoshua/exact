/** Returns React-compatible attribute order for form controls with browser-sensitive properties. */
export function reactOrderedProps(
	props: Record<string, unknown>,
	tag: string | undefined,
	version: boolean | 18 | 19
): Array<[string, unknown]> {
	const entries = Object.entries(props);
	if (tag === 'input') {
		const ordered = deferProps(entries, ['checked', 'defaultChecked', 'value', 'defaultValue']);
		return version === 19 ? prioritizeProps(ordered, ['type', 'disabled', 'name']) : ordered;
	}
	if (tag === 'option') return deferProps(entries, ['value', 'selected']);
	return entries;
}

function prioritizeProps(
	entries: Array<[string, unknown]>,
	names: readonly string[]
): Array<[string, unknown]> {
	const prioritized = new Set(names);
	return [
		...names.flatMap((name) => entries.filter(([entry]) => entry === name)),
		...entries.filter(([name]) => !prioritized.has(name))
	];
}

function deferProps(
	entries: Array<[string, unknown]>,
	names: readonly string[]
): Array<[string, unknown]> {
	const deferred = new Set(names);
	return [
		...entries.filter(([name]) => !deferred.has(name)),
		...names.flatMap((name) => entries.filter(([entry]) => entry === name))
	];
}
