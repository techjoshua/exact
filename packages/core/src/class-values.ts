import { unwrap } from '@exactjs/reactive/framework/values';

/**
 * Normalizes one compiler-authored class value into its DOM attribute representation.
 *
 * Arrays retain source order, objects contribute truthy keys in property order, and reactive
 * values are unwrapped at every nesting level. Duplicate tokens are deliberately preserved:
 * only the compiler can diagnose collisions that are statically provable without changing
 * dynamic authored behavior.
 */
export function normalizeClassValue(value: unknown): string {
	const actual = unwrap(value);
	if (actual === false || actual === null || actual === undefined) return '';
	if (typeof actual === 'string') return actual;
	if (Array.isArray(actual)) {
		return actual
			.map((item) => normalizeClassValue(item))
			.filter(Boolean)
			.join(' ');
	}
	if (typeof actual === 'object') {
		return Object.entries(actual)
			.filter(([, enabled]) => Boolean(unwrap(enabled)))
			.map(([name]) => name)
			.join(' ');
	}
	return String(actual);
}
