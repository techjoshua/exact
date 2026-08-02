import {
	createVNode,
	readExactEnhancementContexts,
	type ComponentFunction,
	type EnhancementEntry,
	type VNode
} from '@exactjs/core';
import type { SsrContext } from '../types.js';

/** Activates declarations carried by one SSR vnode boundary. */
export function activateSsrEnhancements(context: SsrContext, vnode: VNode): VNode {
	const declarations = (vnode.enhancements?.entries ?? []).filter(
		(entry) => !routingOnlyEntry(entry)
	);
	if (!declarations.length) return vnode;
	const active = declarations.filter((entry) => {
		if (context.enhancementCatalog?.has(entry.identity)) return true;
		reportUnavailable(context, entry.identity);
		return false;
	});
	const leaf = withoutEnhancements(vnode);
	if (!active.length) return leaf;
	let chain = leaf;
	const ordered = orderEnhancementEntries(context, active);
	for (let index = ordered.length - 1; index >= 0; index--) {
		const entry = ordered[index]!;
		const component = context.enhancementCatalog!.get(entry.identity)!;
		chain = pluginVNode(context, component, entry, chain, leaf.domain);
	}
	return chain;
}

function routingOnlyEntry(entry: EnhancementEntry): boolean {
	return entry.root !== undefined && Object.keys(entry.props).length === 0;
}

function pluginVNode(
	context: SsrContext,
	component: ComponentFunction<any, Record<string, unknown>>,
	entry: EnhancementEntry,
	child: VNode,
	domain: VNode['domain']
): VNode {
	const vnode = createVNode(component, { ...entry.props }, child);
	const owned = domain ? { ...vnode, domain } : vnode;
	context.enhancementVNodes.add(owned);
	return owned;
}

function withoutEnhancements(vnode: VNode): VNode {
	if (!vnode.enhancements) return vnode;
	const { enhancements: _enhancements, ...plain } = vnode;
	return plain;
}

function orderEnhancementEntries(
	context: SsrContext,
	entries: readonly EnhancementEntry[]
): EnhancementEntry[] {
	const byIdentity = new Map(entries.map((entry) => [entry.identity, entry] as const));
	const providers = new Map<symbol, string[]>();
	const outgoing = new Map<string, Set<string>>();
	const indegree = new Map<string, number>();
	for (const entry of entries) {
		indegree.set(entry.identity, 0);
		outgoing.set(entry.identity, new Set());
		const component = context.enhancementCatalog!.get(entry.identity)!;
		for (const token of readExactEnhancementContexts(component)?.provides ?? []) {
			const identities = providers.get(token) ?? [];
			identities.push(entry.identity);
			providers.set(token, identities);
		}
	}
	for (const entry of entries) {
		const component = context.enhancementCatalog!.get(entry.identity)!;
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

function reportUnavailable(context: SsrContext, identity: string): void {
	if (context.unavailableEnhancements.has(identity)) return;
	context.unavailableEnhancements.add(identity);
	context.logger?.log({
		level: 'warn',
		message: `Optional renderer enhancement "${identity}" is unavailable`,
		scope: { source: 'framework', packageName: '@exactjs/ssr', category: 'enhancement' }
	});
}
