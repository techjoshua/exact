import {
	readExactEnhancementContexts,
	unwrap,
	type Child,
	type CompiledEnhancementNode,
	type EnhancementEntry
} from '@exactjs/core';
import {
	createCompiledComponentReceipt,
	readCompiledComponentReceipt,
	readCompiledFragmentReceipt,
	readCompiledIntrinsicReceipt,
	withoutCompiledComponentReceiptEnhancement,
	withoutCompiledFragmentReceiptEnhancement,
	withoutCompiledIntrinsicReceiptEnhancement,
	withTransparentComponentUpdateOwner
} from '@exactjs/core/runtime/component-operations';
import {
	readRenderProgramReceipt,
	withoutRenderProgramReceiptEnhancement
} from '@exactjs/core/runtime/render-operations';
import type { Mounted, Root } from '../types.js';

/** Builds the context-ordered component chain around one authored target. */
export function createEnhancementChain(
	root: Root,
	entries: readonly EnhancementEntry[],
	leaf: Child
): Child {
	let chain = leaf;
	const ordered = orderEnhancementEntries(root, entries);
	for (let index = ordered.length - 1; index >= 0; index--) {
		const entry = ordered[index]!;
		const component = root.enhancementCatalog!.get(entry.identity)!;
		chain = withTransparentComponentUpdateOwner(
			createCompiledComponentReceipt(component, { ...entry.props }, chain)
		);
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

/** Reads compiler-owned declarations without interpreting the operation's output topology. */
export function childEnhancementEntries(value: Child): readonly EnhancementEntry[] {
	return enhancementEntries(
		readCompiledComponentReceipt(value)?.enhancement ??
			readCompiledIntrinsicReceipt(value)?.enhancement ??
			readCompiledFragmentReceipt(value)?.enhancement ??
			readRenderProgramReceipt(value)?.enhancement
	);
}

/** Resolves a compiler-owned live enhancement marker without inspecting rendered output. */
export function enhancementEntries(value: unknown): readonly EnhancementEntry[] {
	const marker = unwrap(value) as CompiledEnhancementNode | undefined;
	return marker?.kind === 'enhancement' ? marker.entries : [];
}

/** Returns an opaque operation equivalent to the authored target but without its declarations. */
export function withoutEnhancements(value: Child): Child {
	return (
		withoutCompiledComponentReceiptEnhancement(value) ??
		withoutCompiledIntrinsicReceiptEnhancement(value) ??
		withoutCompiledFragmentReceiptEnhancement(value) ??
		withoutRenderProgramReceiptEnhancement(value) ??
		value
	);
}

/** Returns the opaque authored operation retained by a mounted compiler or compatibility node. */
export function mountedAuthoredOperation(mounted: Mounted): Child {
	const operation =
		mounted.enhancement?.operation ??
		mounted.operation ??
		mounted.componentReceipt ??
		mounted.intrinsicReceipt ??
		mounted.fragmentReceipt ??
		mounted.renderProgramReceipt;
	if (operation === undefined)
		throw new Error('Mounted enhancement target does not retain an authored operation');
	return operation;
}

/** Restores the compiler-issued authored operation after removing its enhancement wrapper. */
export function restoreMountedAuthoredOperation(mounted: Mounted, operation: Child): void {
	mounted.operation = operation;
	const component = readCompiledComponentReceipt(operation);
	if (component) mounted.componentReceipt = component;
	const intrinsic = readCompiledIntrinsicReceipt(operation);
	if (intrinsic) mounted.intrinsicReceipt = intrinsic;
	const fragment = readCompiledFragmentReceipt(operation);
	if (fragment) mounted.fragmentReceipt = fragment;
	const program = readRenderProgramReceipt(operation);
	if (program) mounted.renderProgramReceipt = program;
}

/** Reads authored sibling identity from a mounted enhancement target. */
export function mountedEnhancementKey(mounted: Mounted): string | undefined {
	return (
		mounted.operationKey ??
		mounted.componentReceipt?.key ??
		mounted.intrinsicReceipt?.key ??
		mounted.fragmentReceipt?.key ??
		mounted.targetReceipt?.key
	);
}

/** Reads declarations retained by a mounted operation without requiring one to exist. */
export function mountedEnhancementEntries(mounted: Mounted): readonly EnhancementEntry[] {
	const operation =
		mounted.enhancement?.operation ??
		mounted.operation ??
		mounted.componentReceipt ??
		mounted.intrinsicReceipt ??
		mounted.fragmentReceipt ??
		mounted.renderProgramReceipt;
	return operation === undefined ? [] : childEnhancementEntries(operation);
}
