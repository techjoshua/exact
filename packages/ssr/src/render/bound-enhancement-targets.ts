import {
	fallbackEnhancementEntries,
	claimEnhancementFallback,
	enhancementFallbackAvailable,
	forwardEnhancementFallback,
	checkpointEnhancementFallback
} from '@exactjs/core/framework/render-structure';
import { isTextTargetOutput } from '@exactjs/core/framework/render-structure';
import { readServerList } from './server-list.js';
import {
	createEnhancementNode,
	unwrap,
	type CompiledEnhancementNode,
	type EnhancementEntry
} from '@exactjs/core';
import {
	readCompiledComponentReceipt,
	readPreparedServerComponentReference,
	readCompiledIntrinsicReceipt,
	readCompiledFragmentReceipt,
	readCompiledTargetReceipt,
	readChildRangeReceipt,
	readCompiledKeyedChildReceipt
} from '@exactjs/core/runtime/component-operations';
import {
	readPreparedServerRenderProgram,
	readPreparedServerChildRange,
	readPreparedServerKeyedChild
} from '@exactjs/core/framework/server-render-structure';
import type { SsrContext } from '../types.js';

type Candidate = {
	key: object;
	marker?: CompiledEnhancementNode;
	children: readonly unknown[];
	component: boolean;
	intrinsic: boolean;
};

/** Retains a scheduled component's incoming route until its output is finally published. */
export function checkpointBoundEnhancementTarget(context: SsrContext, key: object): () => void {
	const entries = context.boundEnhancementTargets?.get(key);
	const restore = checkpointEnhancementFallback(entries ?? []);
	return () => {
		restore();
		if (entries) context.boundEnhancementTargets!.set(key, entries);
		else context.boundEnhancementTargets?.delete(key);
	};
}

/** Reads only compiler-owned child slots. Prop bags and nested component implementations stay opaque. */
function candidate(value: unknown): Candidate | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const component =
		readCompiledComponentReceipt(value) ?? readPreparedServerComponentReference(value);
	if (component)
		return {
			key: component,
			marker: component.enhancement,
			children: [],
			component: true,
			intrinsic: false
		};
	const intrinsic = readCompiledIntrinsicReceipt(value);
	if (intrinsic)
		return {
			key: value,
			marker: intrinsic.enhancement,
			children: intrinsic.children,
			component: false,
			intrinsic: true
		};
	const fragment = readCompiledFragmentReceipt(value);
	const list = readServerList(value);
	if (list) return { key: value, children: list.children, component: false, intrinsic: false };
	if (fragment)
		return {
			key: value,
			marker: fragment.enhancement,
			children: fragment.children,
			component: false,
			intrinsic: false
		};
	const program = readPreparedServerRenderProgram(value);
	if (program)
		return {
			key: value,
			marker: program.enhancement,
			component: false,
			intrinsic: true,
			children: (program.program.targetSlots ?? []).map((index) => program.eagerValues[index])
		};
	const target = readCompiledTargetReceipt(value);
	if (target) return { key: value, children: target.children, component: false, intrinsic: false };
	const range = readChildRangeReceipt(value) ?? readPreparedServerChildRange(value);
	const keyed = readCompiledKeyedChildReceipt(value) ?? readPreparedServerKeyedChild(value);
	if (range || keyed)
		return {
			key: value,
			children: [range ? unwrap(range.value) : keyed!.value],
			component: false,
			intrinsic: false
		};
	return undefined;
}

/** Selects each namespace in the current authored frame before any output from that frame commits. */
export function selectSsrEnhancementTargets(
	output: readonly unknown[],
	entries: readonly EnhancementEntry[],
	supplied: unknown = undefined
): ReadonlyMap<object, readonly EnhancementEntry[]> {
	const projected = new Set(
		Array.isArray(supplied) ? supplied : supplied === undefined ? [] : [supplied]
	);
	const explicit = new Map<string, object>();
	const identities = new Set(entries.map((entry) => entry.identity));
	const fallbacks: object[] = [];
	let fragmentFallback: object | undefined;
	let textFallback: object | undefined;
	const visit = (raw: unknown, fallbackEligible: boolean, structured = false): void => {
		const value = unwrap(raw);
		if (Array.isArray(value)) {
			for (const child of value) visit(child, fallbackEligible, structured);
			return;
		}
		if (structured && projected.has(value)) return;
		const node = candidate(value);
		const range = readChildRangeReceipt(value) ?? readPreparedServerChildRange(value);
		if (!textFallback && fallbackEligible && range && isTextTargetOutput(range.value))
			textFallback = value as object;
		if (!node) return;
		for (const marker of node.marker?.entries ?? []) {
			if (!identities.has(marker.identity) || !unwrap(marker.root)) continue;
			if (explicit.has(marker.identity))
				throw new Error(`Multiple active enhancement roots for ${marker.identity}`);
			explicit.set(marker.identity, node.key);
		}
		if (fallbackEligible && (node.intrinsic || node.component)) fallbacks.push(node.key);
		if (!fragmentFallback && fallbackEligible && readCompiledFragmentReceipt(value))
			fragmentFallback = node.key;
		for (const child of node.children)
			visit(
				child,
				fallbackEligible && !node.intrinsic,
				structured || node.intrinsic || !!readCompiledFragmentReceipt(value)
			);
	};
	for (const child of output) visit(child, true);
	const grouped = new Map<object, EnhancementEntry[]>();
	for (const entry of entries) {
		if (!enhancementFallbackAvailable(entry)) continue;
		const selected = explicit.get(entry.identity);
		const keys = selected
			? [selected]
			: fallbacks.length
				? fallbacks
				: [fragmentFallback ?? textFallback].filter((key): key is object => !!key);
		const routed = selected
			? [claimEnhancementFallback(entry)]
			: fallbackEnhancementEntries(entry, keys.length);
		for (const [index, key] of keys.entries()) {
			const group = grouped.get(key) ?? [];
			group.push(routed[index]!);
			grouped.set(key, group);
		}
	}
	return grouped;
}

/** Combines incoming declarations with nearer authored activators without making root markers activate. */
export function boundOperationEnhancement(
	context: SsrContext,
	key: object,
	authored?: CompiledEnhancementNode,
	delegate = false
): CompiledEnhancementNode | undefined {
	const incoming = context.boundEnhancementTargets?.get(key);
	if (!incoming) return authored;
	// Consume the binding before re-entering the selected operation inside its wrapper.
	if (incoming.some(enhancementFallbackAvailable)) context.boundEnhancementTargets!.delete(key);
	return combineBoundEnhancementEntries(incoming, authored, delegate);
}

/** Combines already selected entries, retaining delegated claims until a concrete target consumes them. */
export function combineBoundEnhancementEntries(
	incoming: readonly EnhancementEntry[],
	authored?: CompiledEnhancementNode,
	delegate = false
): CompiledEnhancementNode | undefined {
	if (!authored && incoming?.length === 1) {
		const entry = incoming[0]!;
		if (!enhancementFallbackAvailable(entry)) return undefined;
		// An already normalized single namespace needs neither a merge map nor another
		// copy of its props. Delegation retains the shared unresolved fallback claim.
		return Object.freeze({
			kind: 'enhancement',
			entries: Object.freeze([delegate ? entry : claimEnhancementFallback(entry)]),
			fallback: 'preserve-target'
		});
	}
	const bound = incoming.filter(enhancementFallbackAvailable);
	if (!bound?.length) return authored;
	const entries = new Map(
		bound.map((entry) => [entry.identity, delegate ? entry : claimEnhancementFallback(entry)])
	);
	for (const entry of authored?.entries ?? []) {
		const inherited = entries.get(entry.identity);
		if (inherited)
			entries.set(entry.identity, {
				...inherited,
				props: { ...inherited.props, ...entry.props },
				intrinsicFragment: entry.intrinsicFragment ?? inherited.intrinsicFragment
			});
		else entries.set(entry.identity, entry);
	}
	const marker = createEnhancementNode([...entries.values()]);
	if (delegate)
		for (const entry of marker.entries) {
			const source = bound.find((candidate) => candidate.identity === entry.identity);
			if (source) forwardEnhancementFallback(source, entry);
		}
	return marker;
}
