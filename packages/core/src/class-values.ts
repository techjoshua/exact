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
	return appendClassValue('', value);
}

function appendClassValue(output: string, candidate: unknown): string {
	const actual = unwrap(candidate);
	if (actual === false || actual === null || actual === undefined) return output;
	if (Array.isArray(actual)) {
		for (const item of actual) output = appendClassValue(output, item);
		return output;
	}
	if (typeof actual === 'object') {
		for (const name in actual) {
			if (!Object.hasOwn(actual, name)) continue;
			if (Boolean(unwrap((actual as Record<string, unknown>)[name])))
				output = appendClassToken(output, name);
		}
		return output;
	}
	return appendClassToken(output, String(actual));
}

function appendClassToken(output: string, token: string): string {
	if (!token) return output;
	return output ? `${output} ${token}` : token;
}
