import {
	createVNode,
	isExactEnhancementPassThrough,
	readExactEnhancementContexts,
	type AnyEnhancementComponentFunction,
	type EnhancementEntry,
	type VNode
} from '@exactjs/core';
import type { AnyComponentInstance, RenderToStringOptions, SsrContext } from '../types.js';
import {
	planSsrEnhancementBoundary,
	planSsrEnhancementBoundaryAsync
} from './enhancement-planning.js';

/** Activates declarations carried by one SSR vnode boundary. */
export function activateSsrEnhancements(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined
): VNode {
	planBoundaryIfNeeded(context, vnode, parent);
	return activatePlannedTarget(context, vnode);
}

/** Activates a planned target after asynchronous logical materialization. */
export async function activateSsrEnhancementsAsync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions & { taskDeadline?: number }
): Promise<VNode> {
	const declarations = localDeclarations(vnode);
	if (declarations.length) reportUnavailableEntries(context, declarations);
	if (declarations.length && !context.plannedEnhancementBoundaries.has(vnode)) {
		if (declarations.some((entry) => activeEnhancement(context, entry.identity))) {
			await planSsrEnhancementBoundaryAsync(context, vnode, parent, options);
		} else {
			context.plannedEnhancementBoundaries.add(vnode);
		}
	}
	return activatePlannedTarget(context, vnode);
}

function planBoundaryIfNeeded(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined
): void {
	const declarations = localDeclarations(vnode);
	if (!declarations.length) return;
	reportUnavailableEntries(context, declarations);
	if (context.plannedEnhancementBoundaries.has(vnode)) return;
	if (declarations.some((entry) => activeEnhancement(context, entry.identity))) {
		planSsrEnhancementBoundary(context, vnode, parent);
	} else {
		context.plannedEnhancementBoundaries.add(vnode);
	}
}

function activatePlannedTarget(context: SsrContext, vnode: VNode): VNode {
	const declarations = context.enhancementTargets.get(vnode) ?? [];
	if (!declarations.length) return vnode;
	const active = declarations.filter((entry) => {
		if (activeEnhancement(context, entry.identity)) return true;
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
		chain = enhancementVNode(context, component, entry, chain, leaf.domain);
	}
	return chain;
}

function localDeclarations(vnode: VNode): EnhancementEntry[] {
	return (vnode.enhancement?.entries ?? []).filter((entry) => !routingOnlyEntry(entry));
}

function reportUnavailableEntries(context: SsrContext, entries: readonly EnhancementEntry[]): void {
	for (const entry of entries) {
		if (!activeEnhancement(context, entry.identity)) reportUnavailable(context, entry.identity);
	}
}

function routingOnlyEntry(entry: EnhancementEntry): boolean {
	return entry.root !== undefined && Object.keys(entry.props).length === 0;
}

function enhancementVNode(
	context: SsrContext,
	component: AnyEnhancementComponentFunction,
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
	const { enhancement: _enhancement, ...plain } = vnode;
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
	if (isExactEnhancementPassThrough(context.enhancementCatalog?.get(identity))) return;
	if (context.unavailableEnhancements.has(identity)) return;
	context.unavailableEnhancements.add(identity);
	context.logger?.log({
		level: 'warn',
		message: `Optional renderer enhancement "${identity}" is unavailable`,
		scope: { source: 'framework', packageName: '@exactjs/ssr', category: 'enhancement' }
	});
}

function activeEnhancement(context: SsrContext, identity: string): boolean {
	const component = context.enhancementCatalog?.get(identity);
	return component !== undefined && !isExactEnhancementPassThrough(component);
}
