import { unwrap } from '@exactjs/reactive/framework/runtime';
import { normalizeClassValue } from '../class-values.js';

/** Merges ordered target class contributions with stable token de-duplication. */
export function mergeTargetClassContributions(
	values: readonly unknown[]
): string | null | undefined {
	return mergeTargetTokens(values, normalizeClassValue);
}

/** Merges ordered ARIA/token-list target contributions with stable de-duplication. */
export function mergeTargetTokenContributions(
	values: readonly unknown[]
): string | null | undefined {
	return mergeTargetTokens(values, String);
}

function mergeTargetTokens(
	values: readonly unknown[],
	normalize: (value: unknown) => string
): string | null | undefined {
	const tokens: string[] = [];
	let suppressed = false;
	for (const value of values) {
		const actual = unwrap(value);
		if (actual === undefined) continue;
		if (actual === null) {
			suppressed = true;
			continue;
		}
		for (const token of normalize(actual).split(/\s+/))
			if (token && !tokens.includes(token)) tokens.push(token);
	}
	return tokens.length ? tokens.join(' ') : suppressed ? null : undefined;
}
