import { unwrap } from '@exactjs/reactive/framework/runtime';
import { TargetOverrides } from '../symbols.js';
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

const tokenListProps = new Set([
	'aria-describedby',
	'aria-labelledby',
	'aria-controls',
	'aria-owns',
	'aria-flowto',
	'rel'
]);

/** Composes one semantic-target layer with authored and nearest-owner precedence. */
export function composeTargetProps(
	base: Readonly<Record<string, unknown>>,
	layer: Readonly<Record<string, unknown>>
): Record<string, unknown> {
	const result: Record<string, unknown> = { ...base };
	delete (result as Record<PropertyKey, unknown>)[TargetOverrides];
	const overrideValue = unwrap((layer as Readonly<Record<PropertyKey, unknown>>)[TargetOverrides]);
	// Most layers have no overrides. Membership against a string key also ignores
	// non-string entries, without allocating a filtered array or an empty Set per host.
	const overrides =
		Array.isArray(overrideValue) && overrideValue.length ? new Set(overrideValue) : undefined;
	for (const key of new Set([...Object.keys(base), ...Object.keys(layer)])) {
		if (key === 'children' || key === 'key' || key === 'ref' || /^on[A-Z]/.test(key)) continue;
		const authored = unwrap(base[key]);
		const contributed = unwrap(layer[key]);
		if (overrides?.has(key)) result[key] = contributed;
		else if (key === 'class' || key === 'className')
			result[key] = mergeTargetClassContributions([authored, contributed]);
		else if (tokenListProps.has(key))
			result[key] = mergeTargetTokenContributions([authored, contributed]);
		else if (key === 'style' && isRecord(contributed) && isRecord(authored))
			result[key] = { ...contributed, ...authored };
		else result[key] = authored !== undefined ? authored : contributed;
	}
	return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
