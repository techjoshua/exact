import {
	assertEnhancementSourceOrder,
	createFragmentEnhancementChain
} from '@exactjs/core/framework/render-structure';
import {
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

/** Builds the source-ordered component chain around one authored target. */
export function createEnhancementChain(
	root: Root,
	entries: readonly EnhancementEntry[],
	leaf: Child
): Child {
	let chain = leaf;
	const ordered = orderEnhancementEntries(root, entries);
	if (readCompiledFragmentReceipt(leaf))
		return createFragmentEnhancementChain(ordered, leaf, root.enhancementCatalog!, true);
	for (let index = ordered.length - 1; index >= 0; index--) {
		const entry = ordered[index]!;
		const component = root.enhancementCatalog!.get(entry.identity)!;
		chain = withTransparentComponentUpdateOwner(
			createCompiledComponentReceipt(component, { ...entry.props }, chain)
		);
	}
	return chain;
}

/** Validates source nesting without reordering peers; singleton chains need no ordering work. */
export function orderEnhancementEntries(
	root: Root,
	entries: readonly EnhancementEntry[]
): EnhancementEntry[] {
	if (entries.length < 2) return [...entries];
	assertEnhancementSourceOrder(entries, root.enhancementCatalog ?? new Map());
	return [...entries];
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
