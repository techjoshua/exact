import type { ExactRenderProgramInvocation } from '@exactjs/core/runtime/render-operations';
import { acquiredComponentChildren } from './component-receipt-binding.js';
import { readClientComponentInput } from './component-input-admission.js';
import {
	isTextTargetOutput,
	checkpointEnhancementFallback,
	fallbackEnhancementEntries,
	enhancementFallbackTargets,
	claimEnhancementFallback,
	enhancementFallbackAvailable,
	forwardEnhancementFallback,
	prepareTextTargetOutput
} from '@exactjs/core/framework/render-structure';
import {
	isExactEnhancementPassThrough,
	unwrap,
	type Child,
	type EnhancementEntry
} from '@exactjs/core';
import {
	readCompiledIntrinsicReceipt,
	readCompiledFragmentReceipt,
	readCompiledTargetReceipt,
	readChildRangeReceipt,
	readCompiledKeyedChildReceipt
} from '@exactjs/core/runtime/component-operations';
import {
	readRenderProgramReceipt,
	readRenderProgramSlot
} from '@exactjs/core/runtime/render-operations';
import { withPreparedProgramSlots, type PreparedProgramSlots } from './prepared-program-slots.js';
import type { Mounted, Root } from '../types.js';
import { childEnhancementEntries } from './enhancement-chain.js';

/** Incoming namespace entries and the actual boundary that owns their selection. */
type Binding = { entries: readonly EnhancementEntry[]; boundary: Mounted };
// Issued operations retain identity. Validated admitted recipes are temporary renderer views.
const bindings = new WeakMap<Root, Map<object, Binding>>();

/** Captured incoming routes belong only to one queued, still-current target adoption. */
export type PreparedEnhancementBindings = ReadonlyMap<object, Binding>;

/** Retains the active occurrence's routes before its synchronous preparation scope restores them. */
export function capturePreparedEnhancementBindings(
	root: Root
): PreparedEnhancementBindings | undefined {
	const routes = bindings.get(root);
	return routes?.size ? new Map(routes) : undefined;
}

/** Restores captured routes only during the validated target claim, then releases the temporary view. */
export function withCapturedEnhancementBindings<T>(
	root: Root,
	captured: PreparedEnhancementBindings | undefined,
	adopt: () => T
): T {
	if (!captured) return adopt();
	const previous = bindings.get(root);
	bindings.set(root, new Map([...(previous ?? []), ...captured]));
	try {
		return adopt();
	} finally {
		if (previous) bindings.set(root, previous);
		else bindings.delete(root);
	}
}

/** Reads an incoming route without exposing renderer state on compiler receipts. */
export function preparedEnhancementBinding(root: Root, value: Child): Binding | undefined {
	const routes = bindings.get(root);
	if (!routes) return undefined;
	const key = readClientComponentInput(value)?.admitted.operation ?? value;
	const binding = typeof key === 'object' && key !== null ? routes.get(key) : undefined;
	if (binding?.entries.length === 1 && enhancementFallbackAvailable(binding.entries[0]!))
		return binding;
	return binding
		? { ...binding, entries: binding.entries.filter(enhancementFallbackAvailable) }
		: undefined;
}

/** Binds namespaces before consuming prepared output for hydration or text projection. */
export function withPreparedEnhancementBindings<T>(
	root: Root,
	boundary: Mounted,
	children: Child[],
	adopt: (children: Child[]) => T,
	direct?: ExactRenderProgramInvocation
): T {
	const receipt = boundary.componentReceipt;
	if (!receipt) return adopt(children);
	const inherited = preparedEnhancementBinding(
		root,
		boundary.operation ?? receipt.admitted.operation
	);
	if (!inherited && !receipt.enhancement) return adopt(children);
	const merged = new Map((inherited?.entries ?? []).map((entry) => [entry.identity, entry]));
	for (const entry of receipt.enhancement?.entries ?? []) {
		const previous = merged.get(entry.identity);
		merged.set(
			entry.identity,
			previous ? { ...previous, props: { ...previous.props, ...entry.props } } : entry
		);
		if (previous) forwardEnhancementFallback(previous, merged.get(entry.identity)!);
	}
	const entries = [...merged.values()].filter(
		(entry) =>
			enhancementFallbackAvailable(entry) &&
			entry.root === undefined &&
			root.enhancementCatalog?.has(entry.identity) &&
			!isExactEnhancementPassThrough(root.enhancementCatalog.get(entry.identity))
	);
	if (!entries.length) return adopt(children);
	const restoreFallback = checkpointEnhancementFallback(entries);
	const closedRoot =
		children.length === 1 &&
		(direct && children[0] === direct
			? { invocation: direct }
			: readRenderProgramReceipt(children[0]));
	if (closedRoot && !closedRoot.invocation.program.targetSlots?.length) {
		// With no structural slots, this intrinsic is the only possible destination.
		// Preserve adoption rollback without allocating a candidate traversal.
		const key = children[0] as object;
		const routes = bindings.get(root) ?? new Map<object, Binding>();
		bindings.set(root, routes);
		const previous = routes.get(key);
		routes.set(key, { entries, boundary: inherited?.boundary ?? boundary });
		try {
			const result = adopt(children);
			if (result === undefined) restoreFallback();
			return result;
		} catch (error) {
			restoreFallback();
			throw error;
		} finally {
			if (previous) routes.set(key, previous);
			else routes.delete(key);
			if (!routes.size) bindings.delete(root);
		}
	}
	children = prepareTextTargetOutput(children);
	const acquiredChildren = acquiredComponentChildren(boundary);
	const supplied = acquiredChildren.length ? acquiredChildren : receipt.props.children;
	const projected = new Set(
		Array.isArray(supplied) ? supplied : supplied === undefined ? [] : [supplied]
	);
	const capturedSlots: PreparedProgramSlots = new Map();
	const explicit = new Map<string, object>();
	const fallbacks: object[] = [];
	let fragmentFallback: object | undefined;
	let textFallback: object | undefined;
	const visit = (raw: unknown, eligible: boolean, structured = false): void => {
		const value = unwrap(raw);
		if (Array.isArray(value)) {
			for (const item of value) visit(item, eligible, structured);
			return;
		}
		if (typeof value !== 'object' || value === null || (structured && projected.has(value))) return;
		const component = readClientComponentInput(value);
		const intrinsic = readCompiledIntrinsicReceipt(value);
		const fragment = readCompiledFragmentReceipt(value);
		const program = readRenderProgramReceipt(value);
		const key = component?.admitted.operation ?? value;
		for (const marker of childEnhancementEntries(value as Child)) {
			if (!entries.some((entry) => entry.identity === marker.identity) || !unwrap(marker.root))
				continue;
			if (explicit.has(marker.identity))
				throw new Error(`Multiple active enhancement roots for ${marker.identity}`);
			explicit.set(marker.identity, key);
		}
		if (eligible && (component || intrinsic || program)) fallbacks.push(key);
		if (!fragmentFallback && eligible && fragment) fragmentFallback = key;
		if (component) return;
		const target = readCompiledTargetReceipt(value);
		const range = readChildRangeReceipt(value);
		if (!textFallback && eligible && range && isTextTargetOutput(range.value)) textFallback = key;
		const keyed = readCompiledKeyedChildReceipt(value);
		const output =
			intrinsic?.children ??
			fragment?.children ??
			target?.children ??
			(range
				? [unwrap(range.value)]
				: keyed
					? [keyed.value]
					: program
						? (program.invocation.program.targetSlots ?? []).map((index) =>
								(() => {
									const value = readRenderProgramSlot(program.invocation, index);
									let slots = capturedSlots.get(program.invocation);
									if (!slots) capturedSlots.set(program.invocation, (slots = new Map()));
									slots.set(index, value);
									return value;
								})()
							)
						: []);
		for (const child of output)
			visit(
				child,
				eligible && !intrinsic && !program,
				structured || !!intrinsic || !!program || !!fragment
			);
	};
	for (const child of children) visit(child, true);
	const routes = bindings.get(root) ?? new Map<object, Binding>();
	bindings.set(root, routes);
	const previous = new Map<object, Binding | undefined>();
	for (const entry of entries) {
		const selected = explicit.get(entry.identity);
		const keys = enhancementFallbackTargets(selected, fallbacks, fragmentFallback ?? textFallback);
		const candidates = selected
			? [claimEnhancementFallback(entry)]
			: fallbackEnhancementEntries(entry, keys.length);
		for (const [index, key] of keys.entries()) {
			if (!previous.has(key)) {
				previous.set(key, routes.get(key));
				routes.set(key, { entries: [], boundary: inherited?.boundary ?? boundary });
			}
			const binding = routes.get(key)!;
			routes.set(key, { ...binding, entries: [...binding.entries, candidates[index]!] });
		}
	}
	try {
		const result = withPreparedProgramSlots(capturedSlots, () => adopt(children));
		if (result === undefined) restoreFallback();
		return result;
	} catch (error) {
		restoreFallback();
		throw error;
	} finally {
		for (const [key, value] of previous) {
			if (value) routes.set(key, value);
			else routes.delete(key);
		}
		if (!routes.size) bindings.delete(root);
	}
}

/** Consumes a selected operation while adopting its own wrapper chain, preventing recursive activation. */
export function consumePreparedEnhancementBinding<T>(root: Root, value: Child, adopt: () => T): T {
	const key = readClientComponentInput(value)?.admitted.operation ?? value;
	if (typeof key !== 'object' || key === null) return adopt();
	const routes = bindings.get(root);
	const binding = routes?.get(key);
	if (!binding) return adopt();
	const restoreFallback = checkpointEnhancementFallback(binding.entries);
	for (const entry of binding.entries) claimEnhancementFallback(entry);
	routes!.delete(key);
	try {
		const result = adopt();
		if (result === undefined) restoreFallback();
		return result;
	} catch (error) {
		restoreFallback();
		throw error;
	} finally {
		routes!.set(key, binding);
	}
}

/** Merges inherited routes with nearer props while keeping root-only markers inactive. */
export function preparedEnhancementEntries(root: Root, value: Child): readonly EnhancementEntry[] {
	const binding = preparedEnhancementBinding(root, value);
	const authored = childEnhancementEntries(value);
	if (!binding && !authored.length) return [];
	const merged = new Map((binding?.entries ?? []).map((entry) => [entry.identity, entry]));
	for (const entry of authored) {
		const previous = merged.get(entry.identity);
		merged.set(
			entry.identity,
			previous
				? {
						...previous,
						props: { ...previous.props, ...entry.props },
						intrinsicFragment: entry.intrinsicFragment ?? previous.intrinsicFragment
					}
				: entry
		);
	}
	return [...merged.values()].filter(
		(entry) =>
			entry.root === undefined &&
			root.enhancementCatalog?.has(entry.identity) &&
			!isExactEnhancementPassThrough(root.enhancementCatalog.get(entry.identity))
	);
}
