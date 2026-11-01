import type { ExactContinuationStatePathContract } from '@exactjs/core/framework/component-contracts';
/** One actual addressed field, normalized to raw identity by the state planner. */
export type StateFieldAddress = Readonly<{ receiver: object; key: PropertyKey }>;
/** Whole-state footprint prepared without changing ordering history or live state. */
export type StatePublicationFootprint = Readonly<{
	fields: readonly Readonly<{ leaf: StateFieldAddress; ancestors: readonly StateFieldAddress[] }>[];
	structures: readonly object[];
	structureAncestors: readonly StateFieldAddress[];
	replaceRoot?: boolean;
}>;
type Cell = { direct: number; below: number };
type History = {
	paths: Map<string, number>;
	fields: WeakMap<object, Map<PropertyKey, Cell>>;
	structures: WeakMap<object, number>;
	rootDirect: number;
	rootBelow: number;
};
const committed = new WeakMap<object, History>();
/** Accepts and records one actual prepared STATE publication atomically at its staged apply point. */
export function acceptComponentStateCommit(
	owner: object,
	writes: readonly ExactContinuationStatePathContract[],
	ordinal: number,
	footprint?: StatePublicationFootprint
): boolean {
	const paths = footprint
		? []
		: writes.filter((w) => w.kind === 'write' && w.confidence === 'exact').map((w) => w.path);
	if (
		!paths.length &&
		(!footprint ||
			(!footprint.fields.length && !footprint.structures.length && !footprint.replaceRoot))
	)
		return true;
	let history = committed.get(owner);
	const cell = (address: StateFieldAddress) =>
		history?.fields.get(address.receiver)?.get(address.key);
	if (history) {
		for (const path of paths)
			for (const [previous, version] of history.paths)
				if (version > ordinal && overlaps(path, previous)) return false;
		if (footprint) {
			if (history.rootDirect > ordinal || (footprint.replaceRoot && history.rootBelow > ordinal))
				return false;
			for (const field of footprint.fields) {
				const current = cell(field.leaf);
				if (current && (current.direct > ordinal || current.below > ordinal)) return false;
				for (const ancestor of field.ancestors)
					if ((cell(ancestor)?.direct ?? 0) > ordinal) return false;
			}
			for (const ancestor of footprint.structureAncestors)
				if ((cell(ancestor)?.direct ?? 0) > ordinal) return false;
			for (const array of footprint.structures)
				if ((history.structures.get(array) ?? 0) > ordinal) return false;
		}
	}
	if (!history) {
		history = {
			paths: new Map(),
			fields: new WeakMap(),
			structures: new WeakMap(),
			rootDirect: 0,
			rootBelow: 0
		};
		committed.set(owner, history);
	}
	const stamp = (address: StateFieldAddress, direct: boolean) => {
		let fields = history!.fields.get(address.receiver);
		if (!fields) {
			fields = new Map();
			history!.fields.set(address.receiver, fields);
		}
		let value = fields.get(address.key);
		if (!value) {
			value = { direct: 0, below: 0 };
			fields.set(address.key, value);
		}
		if (direct) value.direct = Math.max(value.direct, ordinal);
		else value.below = Math.max(value.below, ordinal);
	};
	for (const path of paths)
		history.paths.set(path, Math.max(ordinal, history.paths.get(path) ?? 0));
	if (footprint) {
		if (footprint.replaceRoot) history.rootDirect = Math.max(ordinal, history.rootDirect);
		history.rootBelow = Math.max(ordinal, history.rootBelow);
		for (const field of footprint.fields) {
			stamp(field.leaf, true);
			for (const ancestor of field.ancestors) stamp(ancestor, false);
		}
		for (const ancestor of footprint.structureAncestors) stamp(ancestor, false);
		for (const array of footprint.structures)
			history.structures.set(array, Math.max(ordinal, history.structures.get(array) ?? 0));
	}
	return true;
}
function overlaps(left: string, right: string): boolean {
	return (
		left === '*' ||
		right === '*' ||
		left === right ||
		left.startsWith(right + '.') ||
		right.startsWith(left + '.')
	);
}

const componentIds = new WeakMap<object, number>();
let nextComponentId = 1;

/** Returns one request-generation namespace for a live component instance. */
export function componentRequestIdentity(instance: object): string {
	let id = componentIds.get(instance);
	if (!id) {
		id = nextComponentId++;
		componentIds.set(instance, id);
	}
	return `component:${id}`;
}
