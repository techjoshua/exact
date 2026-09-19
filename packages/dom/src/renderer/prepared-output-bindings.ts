import {
	isTextTargetOutput,
	checkpointEnhancementFallback,
	fallbackEnhancementEntries,
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
	readCompiledComponentReceipt,
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
import type { Mounted, Root } from '../types.js';
import { childEnhancementEntries } from './enhancement-chain.js';

type Binding = { entries: readonly EnhancementEntry[]; boundary: Mounted };
const bindings = new WeakMap<Root, Map<object, Binding>>();

/** Reads an incoming route without exposing renderer state on compiler receipts. */
export function preparedEnhancementBinding(root: Root, value: Child): Binding | undefined {
	const routes = bindings.get(root);
	if (!routes) return undefined;
	const key = readCompiledComponentReceipt(value) ?? value;
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
	adopt: (children: Child[]) => T
): T {
	const receipt = boundary.componentReceipt;
	if (!receipt) return adopt(children);
	const inherited = preparedEnhancementBinding(root, boundary.operation ?? receipt);
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
	const closedRoot = children.length === 1 && readRenderProgramReceipt(children[0]);
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
	const supplied = receipt.children.length ? receipt.children : receipt.props.children;
	const projected = new Set(
		Array.isArray(supplied) ? supplied : supplied === undefined ? [] : [supplied]
	);
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
		const component = readCompiledComponentReceipt(value);
		const intrinsic = readCompiledIntrinsicReceipt(value);
		const fragment = readCompiledFragmentReceipt(value);
		const program = readRenderProgramReceipt(value);
		const key = component ?? value;
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
								readRenderProgramSlot(program.invocation, index)
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
		const keys = selected
			? [selected]
			: fallbacks.length
				? fallbacks
				: [fragmentFallback ?? textFallback].filter((key): key is object => !!key);
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
		const result = adopt(children);
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
	const key = readCompiledComponentReceipt(value) ?? value;
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
