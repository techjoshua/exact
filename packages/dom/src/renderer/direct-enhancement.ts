import {
	type AnyComponentInstance,
	type Child,
	isExactEnhancementPassThrough,
	readExactEnhancementContexts
} from '@exactjs/core';
import { readRenderProgramReceipt } from '@exactjs/core/runtime/render-operations';
import {
	readCompiledComponentReceipt,
	readCompiledFragmentReceipt,
	readCompiledIntrinsicReceipt
} from '@exactjs/core/runtime/component-operations';
import { createEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { placeMountedBefore } from '../placement.js';
import type { Mounted, Root } from '../types.js';
import {
	childEnhancementEntries,
	createEnhancementChain,
	restoreMountedAuthoredOperation,
	withoutEnhancements
} from './enhancement-chain.js';
import type { EnhancementMountOperation } from './enhancement-capability.js';
import { createMarker } from './root-support.js';
import { disposeMounted } from './teardown.js';

/** Mounts a context-providing direct target before constructing its descendants. */
export function mountDirectEnhancementBoundary(
	root: Root,
	operation: Child,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined,
	mount: EnhancementMountOperation
): Mounted | undefined {
	if (!isDirectTarget(operation)) return undefined;
	const entries = childEnhancementEntries(operation).filter((entry) => {
		const component = root.enhancementCatalog?.get(entry.identity);
		if (component !== undefined && !isExactEnhancementPassThrough(component)) return true;
		reportUnavailable(root, entry.identity);
		return false;
	});
	if (!entries.length || !entries.some((entry) => providesContext(root, entry.identity)))
		return undefined;

	const scope = createEffectScope(parentScope);
	const start = createMarker(root, 'enhancement');
	const end = createMarker(root, 'enhancement-end');
	const physicalParent = document.createDocumentFragment();
	physicalParent.append(start, end);
	const leaf = withoutEnhancements(operation);
	let enhancement: Mounted;
	try {
		enhancement = mount(
			createEnhancementChain(root, entries, leaf),
			parentInstance,
			scope,
			physicalParent
		);
	} catch (error) {
		scope.stop();
		throw error;
	}
	placeMountedBefore(root, physicalParent, enhancement, end);
	const target = findMountedOperation(enhancement, leaf);
	if (!target) {
		disposeMounted(physicalParent, enhancement);
		scope.stop();
		throw new Error('Direct enhancement chain did not retain its authored target');
	}
	restoreMountedAuthoredOperation(target, operation);
	return {
		dom: start,
		end,
		scope,
		children: [enhancement],
		enhancement: {
			operation,
			entries,
			inheritedIdentities: new Set(),
			target,
			boundaries: new Map(entries.map((entry) => [entry.identity, [target] as readonly Mounted[]]))
		}
	};
}

function providesContext(root: Root, identity: string): boolean {
	const component = root.enhancementCatalog!.get(identity)!;
	return (readExactEnhancementContexts(component)?.provides?.length ?? 0) > 0;
}

function isDirectTarget(operation: Child): boolean {
	return !!(
		readCompiledIntrinsicReceipt(operation) ??
		readCompiledFragmentReceipt(operation) ??
		readRenderProgramReceipt(operation)
	);
}

function findMountedOperation(mounted: Mounted, operation: Child): Mounted | undefined {
	if (mounted.operation === operation) return mounted;
	const component = readCompiledComponentReceipt(operation);
	const intrinsic = readCompiledIntrinsicReceipt(operation);
	const fragment = readCompiledFragmentReceipt(operation);
	const program = readRenderProgramReceipt(operation);
	if (
		(component !== undefined && mounted.componentReceipt === component) ||
		(intrinsic !== undefined && mounted.intrinsicReceipt === intrinsic) ||
		(fragment !== undefined && mounted.fragmentReceipt === fragment) ||
		(program !== undefined && mounted.renderProgramReceipt === program)
	)
		return mounted;
	for (const child of mounted.children) {
		const found = findMountedOperation(child, operation);
		if (found) return found;
	}
	return undefined;
}

function reportUnavailable(root: Root, identity: string): void {
	if (isExactEnhancementPassThrough(root.enhancementCatalog?.get(identity))) return;
	root.unavailableEnhancements ??= new Set();
	if (root.unavailableEnhancements.has(identity)) return;
	root.unavailableEnhancements.add(identity);
	root.logger?.log({
		level: 'warn',
		message: `Optional renderer enhancement "${identity}" is unavailable`,
		scope: { source: 'framework', packageName: '@exactjs/dom', category: 'enhancement' }
	});
}
