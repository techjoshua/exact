import { isPlainObject } from './internal/objects.js';
import { unwrap } from './internal/values.js';

type SnapshotContainer = unknown[] | Map<unknown, unknown> | Set<unknown> | object;
type SnapshotWork = { source: SnapshotContainer; target: SnapshotContainer };

/** Creates a plain recursive snapshot of reactive state for serialization or comparison. */
export function snapshot<T>(value: T): T {
	const root = unwrap(value);
	if (!isSnapshotContainer(root)) return root;
	const output = createSnapshotContainer(root);
	const seen = new WeakMap<object, unknown>([[root, output]]);
	const pending: SnapshotWork[] = [{ source: root, target: output }];
	while (pending.length) {
		const { source, target } = pending.pop()!;
		if (source instanceof Map) {
			const targetMap = target as Map<unknown, unknown>;
			for (const [key, child] of source) targetMap.set(key, snapshotChild(child, seen, pending));
			continue;
		}
		if (source instanceof Set) {
			const targetSet = target as Set<unknown>;
			for (const child of source) targetSet.add(snapshotChild(child, seen, pending));
			continue;
		}
		if (Array.isArray(source)) (target as unknown[]).length = source.length;
		const keys: PropertyKey[] = Array.isArray(source)
			? Array.from({ length: source.length }, (_, index) => index).filter((index) =>
					Reflect.has(source, index)
				)
			: Reflect.ownKeys(source);
		for (const key of keys)
			defineSnapshotProperty(target, key, snapshotChild(Reflect.get(source, key), seen, pending));
	}
	return output as T;
}

function snapshotChild(
	value: unknown,
	seen: WeakMap<object, unknown>,
	pending: SnapshotWork[]
): unknown {
	const child = unwrap(value);
	if (!isSnapshotContainer(child)) return child;
	const prior = seen.get(child);
	if (prior) return prior;
	const clone = createSnapshotContainer(child);
	seen.set(child, clone);
	pending.push({ source: child, target: clone });
	return clone;
}

function isSnapshotContainer(value: unknown): value is object {
	return (
		!!value &&
		typeof value === 'object' &&
		(Array.isArray(value) || value instanceof Map || value instanceof Set || isPlainObject(value))
	);
}

function createSnapshotContainer(value: object): SnapshotContainer {
	if (Array.isArray(value)) return [];
	if (value instanceof Map) return new Map();
	if (value instanceof Set) return new Set();
	return Object.create(Object.getPrototypeOf(value));
}

/** Defines snapshot data without invoking the legacy `__proto__` setter. */
function defineSnapshotProperty(target: object, key: PropertyKey, value: unknown): void {
	Object.defineProperty(target, key, {
		value,
		writable: true,
		enumerable: true,
		configurable: true
	});
}
