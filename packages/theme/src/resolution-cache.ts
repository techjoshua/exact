import type { ResolvedTheme, ResolvedThemeSource, ThemeWarning } from './contracts.js';

// A process may serve arbitrarily many user-selected themes. Retain only a small working set,
// and bypass unusually large sources so custom font stacks cannot grow retained keys unchecked.
const themes = new Map<string, ResolvedTheme>();
const reusable = new WeakMap<ResolvedTheme, symbol>();
const capacity = 32;
const maximumKeyLength = 8192;

/**
 * Reuses immutable results after source validation and inheritance have completed.
 * The key includes full-precision resolved values and input warnings. Display fingerprints
 * round color values and cannot distinguish all inspected results. Entries contain theme data
 * only, never scope definitions, component instances, requests, or the creation callback.
 * Least-recently-used entries are evicted after 32 distinct sources. Oversized keys bypass reuse.
 */
export function reuseResolvedTheme(
	source: ResolvedThemeSource,
	warnings: readonly ThemeWarning[],
	create: () => ResolvedTheme
): ResolvedTheme {
	const key = resolutionKey([source, warnings]);
	if (key === undefined) return create();
	const existing = themes.get(key);
	if (existing) {
		themes.delete(key);
		themes.set(key, existing);
		return existing;
	}
	const theme = create();
	if (themes.size === capacity) themes.delete(themes.keys().next().value!);
	themes.set(key, theme);
	reusable.set(theme, Symbol());
	return theme;
}

/** Identifies cacheable results without requiring presentations to retain their resolved theme graphs. */
export function resolvedThemeReuseIdentity(theme: ResolvedTheme): symbol | undefined {
	return reusable.get(theme);
}

/** Encodes plain data without invoking authored serialization hooks or rounding inspected numbers. */
function resolutionKey(value: unknown): string | undefined {
	let key = '';
	const ancestors = new Set<object>();
	const append = (value: unknown): boolean => {
		if (key.length > maximumKeyLength) return false;
		if (value === null) key += 'null';
		else if (value === undefined) key += 'undefined';
		else if (typeof value === 'number') {
			if (!Number.isFinite(value)) return false;
			key += Object.is(value, -0) ? '-0' : String(value);
		} else if (typeof value === 'string' || typeof value === 'boolean')
			key += JSON.stringify(value);
		else if (typeof value === 'object') {
			const array = Array.isArray(value);
			const prototype = Object.getPrototypeOf(value);
			if ((!array && prototype !== Object.prototype && prototype !== null) || ancestors.has(value))
				return false;
			ancestors.add(value);
			key += array ? '[' : '{';
			for (const name of Reflect.ownKeys(value)) {
				if (array && name === 'length') continue;
				const descriptor = Object.getOwnPropertyDescriptor(value, name)!;
				if (typeof name !== 'string' || !('value' in descriptor)) return false;
				key += `${JSON.stringify(name)}:`;
				if (!append(descriptor.value)) return false;
				key += ',';
			}
			key += array ? ']' : '}';
			ancestors.delete(value);
		} else return false;
		return key.length <= maximumKeyLength;
	};
	return append(value) ? key : undefined;
}
