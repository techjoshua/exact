import {
	createVNode,
	readExactEnhancementContexts,
	type ComponentFunction,
	type EnhancementEntry,
	type VNode
} from '@exactjs/core';
import type { Root } from '../types.js';

/** Builds the context-ordered component chain around one authored target. */
export function createPluginChain(
	root: Root,
	entries: readonly EnhancementEntry[],
	leaf: VNode
): VNode {
	let chain = leaf;
	const ordered = orderEnhancementEntries(root, entries);
	for (let index = ordered.length - 1; index >= 0; index--) {
		const entry = ordered[index]!;
		const component = root.enhancementCatalog!.get(entry.identity)!;
		chain = pluginVNode(component, entry, chain, leaf.domain);
	}
	return chain;
}

function orderEnhancementEntries(
	root: Root,
	entries: readonly EnhancementEntry[]
): EnhancementEntry[] {
	const byIdentity = new Map(entries.map((entry) => [entry.identity, entry] as const));
	const providers = new Map<symbol, string[]>();
	const outgoing = new Map<string, Set<string>>();
	const indegree = new Map<string, number>();
	for (const entry of entries) {
		indegree.set(entry.identity, 0);
		outgoing.set(entry.identity, new Set());
		const component = root.enhancementCatalog!.get(entry.identity)!;
		for (const token of readExactEnhancementContexts(component)?.provides ?? []) {
			const identities = providers.get(token) ?? [];
			identities.push(entry.identity);
			providers.set(token, identities);
		}
	}
	for (const entry of entries) {
		const component = root.enhancementCatalog!.get(entry.identity)!;
		const contract = readExactEnhancementContexts(component);
		const consumed = [...(contract?.requires ?? []), ...(contract?.optionallyConsumes ?? [])];
		for (const token of consumed) {
			for (const provider of providers.get(token) ?? []) {
				if (provider === entry.identity || outgoing.get(provider)!.has(entry.identity)) continue;
				outgoing.get(provider)!.add(entry.identity);
				indegree.set(entry.identity, indegree.get(entry.identity)! + 1);
			}
		}
	}
	const ready = [...indegree]
		.filter(([, count]) => count === 0)
		.map(([identity]) => identity)
		.sort();
	const result: EnhancementEntry[] = [];
	while (ready.length) {
		const identity = ready.shift()!;
		result.push(byIdentity.get(identity)!);
		for (const consumer of [...outgoing.get(identity)!].sort()) {
			const next = indegree.get(consumer)! - 1;
			indegree.set(consumer, next);
			if (next === 0) {
				ready.push(consumer);
				ready.sort();
			}
		}
	}
	if (result.length !== entries.length) {
		const cycle = [...indegree]
			.filter(([, count]) => count > 0)
			.map(([identity]) => identity)
			.sort();
		throw new Error(`Enhancement context ordering cycle: ${cycle.join(', ')}`);
	}
	return result;
}

function pluginVNode(
	component: ComponentFunction<any, Record<string, unknown>>,
	entry: EnhancementEntry,
	child: VNode,
	domain: VNode['domain']
): VNode {
	const vnode = createVNode(component, { ...entry.props }, child);
	return domain ? { ...vnode, domain } : vnode;
}

export function withoutEnhancements(vnode: VNode): VNode {
	if (!vnode.enhancements) return vnode;
	const { enhancements: _enhancements, ...plain } = vnode;
	return plain;
}
