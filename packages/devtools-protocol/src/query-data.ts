import { inspectionLimit } from './protocol-value-shapes.js';

/**
 * Copies bounded transport data through own data descriptors, so schema checks and dispatch read
 * the same snapshot. Explicit work frames avoid native stack growth. Every serialized occurrence,
 * including shared children, consumes the node budget, and cycles terminate at a graph limit.
 * Plain records become null-prototype records to prevent inherited fields from selecting work.
 * Accessors and unsupported values throw. Hidden data and symbol fields are omitted, and native
 * array cells are copied without consulting an authored iterator. Pending work and copied nodes are bounded
 * by maxNodes. Discovering input property descriptors still follows the input object width. The supplied limits must be nonnegative depth and positive node safe integers.
 */
export function inspectionQueryData(value: unknown, maxDepth: number, maxNodes: number): unknown {
	inspectionLimit(maxDepth, 0, 'query limits');
	inspectionLimit(maxNodes, 1, 'query limits');
	const root: Record<string, unknown> = {};
	const pending: Array<{
		value: unknown;
		depth: number;
		parent: Record<string, unknown> | unknown[];
		key: string;
	}> = [{ value, depth: 0, parent: root, key: 'value' }];
	let nodes = 0;
	while (pending.length) {
		const entry = pending.pop()!;
		if (++nodes > maxNodes) throw new RangeError('eXact inspection query is too large');
		if (entry.depth > maxDepth) throw new RangeError('eXact inspection query is too deep');
		const current = entry.value;
		let copied = current;
		if (current !== null && typeof current === 'object') {
			const array = Array.isArray(current);
			const prototype = Object.getPrototypeOf(current);
			if (
				array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null
			)
				throw new TypeError('Invalid eXact inspection query data');
			if (array && current.length > maxNodes - nodes - pending.length)
				throw new RangeError('eXact inspection query is too large');
			const keys = array
				? Array.from({ length: current.length }, (_, index) => String(index))
				: Object.keys(current);
			if (keys.length > maxNodes - nodes - pending.length)
				throw new RangeError('eXact inspection query is too large');
			const descriptors = Object.getOwnPropertyDescriptors(current);
			for (const descriptor of Object.values(descriptors))
				if (!('value' in descriptor))
					throw new TypeError('Accessor in eXact inspection query data');
			copied = array ? [] : Object.create(null);
			for (let index = keys.length - 1; index >= 0; index--) {
				const key = keys[index]!;
				const descriptor = descriptors[key];
				if (!descriptor || !('value' in descriptor))
					throw new TypeError('Missing eXact inspection query data');
				pending.push({
					value: descriptor.value,
					depth: entry.depth + 1,
					parent: copied as Record<string, unknown>,
					key
				});
			}
		} else if (
			typeof current === 'function' ||
			typeof current === 'symbol' ||
			typeof current === 'bigint' ||
			(typeof current === 'number' && !Number.isFinite(current))
		) {
			throw new TypeError('Invalid eXact inspection query data');
		}
		Object.defineProperty(entry.parent, entry.key, {
			value: copied,
			enumerable: true,
			writable: true,
			configurable: true
		});
	}
	return root.value;
}

/** Reads a bounded own request ID for rejection responses without invoking getters, including on malformed or revoked inputs. */
export function readExactInspectionRequestId(value: unknown): string {
	try {
		const descriptor =
			typeof value === 'object' && value !== null && !Array.isArray(value)
				? Object.getOwnPropertyDescriptor(value, 'id')
				: undefined;
		return descriptor &&
			'value' in descriptor &&
			typeof descriptor.value === 'string' &&
			descriptor.value.length > 0 &&
			descriptor.value.length <= 256
			? descriptor.value
			: 'invalid-request';
	} catch {
		return 'invalid-request';
	}
}
