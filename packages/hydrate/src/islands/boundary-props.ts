import { normalizeSerializedComponentResumptions } from '../config-validation.js';
import { revivePartitionServerSlots } from './partition-slots.js';
import { positiveLimit, utf8ByteLength } from '../limits.js';
import { decodeBoundedReactiveProtocolValue } from '../protocol-decoding.js';
import type { HydrateOptions } from '../types.js';

/** Decodes a compact table coordinate only when its row matches the boundary identity. */
export function compactBoundaryProps(
	boundary: Element,
	options: HydrateOptions
):
	| { readonly id: string; readonly name: string; readonly props: Record<string, unknown> }
	| undefined {
	const coordinate = boundary.getAttribute('data-xh');
	const match = coordinate?.match(/^([0-9a-z]+)\.([0-9a-z]+)$/);
	const table = options.hydrationTable;
	if (!match || !table || table[0] !== 1) return undefined;
	const group = table[1][Number.parseInt(match[1]!, 36)];
	const row = group?.[2][Number.parseInt(match[2]!, 36)];
	if (
		!group ||
		!row ||
		typeof group[0] !== 'string' ||
		!Array.isArray(group[1]) ||
		!group[1].every((name) => typeof name === 'string') ||
		typeof row[0] !== 'string'
	)
		return undefined;
	const authoredId = boundary.getAttribute('data-exact-client-boundary');
	if (authoredId !== null && row[0] !== authoredId) return undefined;
	const names = group[1];
	if (row.length !== names.length + 1) return undefined;
	const props: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
	for (let index = 0; index < names.length; index++) props[names[index]!] = row[index + 1];
	return {
		id: row[0],
		name: group[0],
		props: revivePartitionServerSlots(props, options, boundary) as Record<string, unknown>
	};
}

/** Validates bounded island payloads before any activation can consume their state. */
export function parseIslandPayload(
	raw: string | null,
	options: HydrateOptions,
	boundary?: Element
) {
	if (!raw) return { props: {}, resumptions: undefined };
	const maxBytes = positiveLimit(options.configLimits?.maxBytes, 16 * 1024 * 1024);
	if (utf8ByteLength(raw) > maxBytes)
		throw new TypeError('eXact island payload exceeds byte limit');
	const encoded = JSON.parse(raw);
	const parsed = decodeBoundedReactiveProtocolValue(
		encoded,
		{
			maxDepth: positiveLimit(options.configLimits?.maxDepth, 100),
			maxNodes: positiveLimit(options.configLimits?.maxNodes, 100_000),
			maxBytes
		},
		() => new TypeError('Malformed eXact island props')
	);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
		throw new TypeError('Malformed eXact island payload');
	const props = (parsed as Record<string, unknown>).props;
	return {
		resumptions: normalizeSerializedComponentResumptions(
			(parsed as Record<string, unknown>).resumptions
		),
		props:
			props && typeof props === 'object' && !Array.isArray(props)
				? (revivePartitionServerSlots(props, options, boundary) as Record<string, unknown>)
				: {}
	};
}
