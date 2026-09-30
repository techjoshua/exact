import type { CoreHydrationRoot, HydrateOptions } from '../types.js';
import { roots } from './state.js';
import { trackHydrationSettlement, waitForHydrationReadiness } from './settlement.js';
import { consumeDomWork, createDomWorkBudget, type DomWorkBudget } from '@exactjs/dom/root';
import { decodeExactMarkerPart, logFrameworkEvent } from '@exactjs/core';
import { prepareRegistryHydration } from '@exactjs/core/runtime/registry';

/** Resolves compiler-registered lazy selections before their server DOM is adopted. */
export function prepareSelectedRegistries(
	container: Element,
	work: DomWorkBudget = createDomWorkBudget()
): Promise<void> | undefined {
	return prepareRegistryHydration(selectedRegistryIdentities(container, work));
}

/** Walks only this activation's markers, leaving independent deferred islands unloaded. */
function* selectedRegistryIdentities(container: Element, work: DomWorkBudget): Generator<string> {
	const walker = container.ownerDocument.createTreeWalker(container, 0xffffffff, {
		acceptNode(node) {
			consumeDomWork(work);
			if (node.nodeType === 1) {
				const element = node as Element;
				if (element.hasAttribute('data-exact-client-boundary') || element.hasAttribute('data-xh'))
					return 2;
			}
			return node.nodeType === 8 ? 1 : 3;
		}
	});
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const value = node.nodeValue ?? '';
		if (value.startsWith('exact:component:')) {
			const identity = value.split(':')[3];
			if (identity) yield decodeExactMarkerPart(identity);
		}
	}
}

const pendingRegistryRoots = new WeakMap<CoreHydrationRoot, { cancel(): void }>();

/** Supersedes a pending root adoption without cancelling a shared module import. */
export function cancelPendingRootHydration(
	root: CoreHydrationRoot,
	container: Element | Document
): void {
	const pending = pendingRegistryRoots.get(root);
	if (!pending) return;
	if (container.nodeType === 9)
		throw new Error('Wait for document hydration to settle before updating its root');
	pending.cancel();
	pendingRegistryRoots.delete(root);
	// No renderer owns this server range yet. An explicit replacement must retire it before mounting.
	container.replaceChildren();
}

/** Owns lazy preparation for either public or compiler-selected root hydration. */
export function activateHydrationWhenReady<T extends CoreHydrationRoot>(
	root: T,
	rootContainer: Element,
	resolvedOptions: HydrateOptions,
	work: DomWorkBudget,
	activate: () => T
): T {
	let pending: Promise<void> | undefined;
	try {
		pending = prepareSelectedRegistries(rootContainer, work);
	} catch (error) {
		root.dispose();
		throw error;
	}
	if (!pending) return activate();
	let cancel!: () => void;
	const cancelled = new Promise<void>((resolve) => {
		cancel = resolve;
	});
	const generation = { cancel };
	pendingRegistryRoots.set(root, generation);
	const adoption = waitForHydrationReadiness(root.domain, Promise.race([pending, cancelled])).then(
		() => {
			if (roots.get(rootContainer) !== root || pendingRegistryRoots.get(root) !== generation)
				return;
			pendingRegistryRoots.delete(root);
			activate();
		}
	);
	trackHydrationSettlement(root.domain, adoption);
	void adoption.catch((error) =>
		logFrameworkEvent(
			'error',
			'hydrate',
			'registry',
			'selected registry loading failed',
			error,
			resolvedOptions.logger
		)
	);
	return root;
}
