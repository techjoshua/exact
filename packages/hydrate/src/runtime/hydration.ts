import type { ComponentDomain, VNode } from '@exactjs/core';
import {
	adoptComponentRoot,
	adoptDocumentRoot,
	adoptMarkerlessComponentRoot,
	adoptStatic,
	createDomWorkBudget,
	render,
	synchronizeFormBinding,
	type DomWorkBudget,
	type RenderOptions
} from '@exactjs/dom';
import { captureHydrationDom, restoreFormState } from '../adoption/form-state.js';
import { adoptStaticTree, createStaticAdoptionBudget } from '../adoption/static-tree.js';
import { resolveHydrateOptions } from '../config.js';
import { reportMismatch } from '../patches.js';
import type { HydrateOptions, HydrateProfileEvent, HydrationRoot } from '../types.js';
import { createExactClient, remainingDomWork } from './client.js';
import { checkpointComponentResumptions, rollbackComponentResumptions } from './resumption.js';
import { roots } from './state.js';

/** Hydrates a server-rendered container and returns ownership of its client root. */
export function hydrate(
	vnode: VNode,
	container: Element | Document,
	options: HydrateOptions = {}
): HydrationRoot {
	const started = options.onProfile ? performance.now() : undefined;
	try {
		return hydrateRoot(vnode, container, options);
	} finally {
		if (started !== undefined) {
			options.onProfile?.(
				Object.freeze({
					subsystem: 'hydrate',
					phase: 'hydrate',
					elapsedMs: performance.now() - started
				} satisfies HydrateProfileEvent)
			);
		}
	}
}

/** Adopts the root DOM range, reporting mismatches before applying client mutations. */
export function hydrateRoot(
	vnode: VNode,
	container: Element | Document,
	options: HydrateOptions
): HydrationRoot {
	// A DOM can be supplied by a window that is not installed on globalThis.
	// nodeType avoids coupling hydration to that realm's Document constructor.
	const documentNode = container.nodeType === 9 ? (container as Document) : undefined;
	const rootContainer = documentNode?.documentElement ?? (container as Element);
	const existing = roots.get(rootContainer);
	if (existing) {
		render(ownedVNode(vnode, existing.domain), rootContainer, {
			logger: options.logger,
			onErrorReport: options.onErrorReport,
			maxTreeDepth: options.maxTreeDepth,
			maxTreeNodes: options.maxTreeNodes,
			allowUnsafeHtml: options.allowUnsafeHtml,
			onUnsafeHtml: options.onUnsafeHtml,
			onProfile: options.onProfile,
			enhancementCatalog: options.enhancementCatalog
		});
		options.onHydration?.(
			Object.freeze({
				kind: 'root',
				outcome: 'updated',
				markers: 'none'
			})
		);
		return existing;
	}
	const resolvedOptions = resolveHydrateOptions(rootContainer, options);
	const root = createExactClient(rootContainer, resolvedOptions);
	vnode = ownedVNode(vnode, root.domain);
	const work = createDomWorkBudget(resolvedOptions.maxTreeNodes);
	const captured = captureHydrationDom(rootContainer, work);
	const formState = captured.formState;
	try {
		const outcome = adoptOrMountRoot(
			vnode,
			rootContainer,
			documentNode,
			captured.hasMarkers,
			resolvedOptions,
			work,
			root.domain
		);
		for (const control of restoreFormState(rootContainer, formState, work))
			synchronizeFormBinding(control);
		releaseProgressiveHelper(rootContainer);
		rootContainer.setAttribute('data-exact-hydrated', 'true');
		resolvedOptions.onHydration?.(
			Object.freeze({
				kind: 'root',
				outcome,
				markers: documentNode
					? 'document'
					: captured.hasMarkers
						? 'exact'
						: resolvedOptions.allowMarkerless
							? 'markerless'
							: 'none'
			})
		);
		return root;
	} catch (error) {
		root.dispose();
		throw error;
	}
}

function releaseProgressiveHelper(root: Element): void {
	let hash = 2166136261;
	const rootId = root.id || 'exact-root';
	for (let index = 0; index < rootId.length; index++) {
		hash ^= rootId.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	delete (globalThis as Record<string, unknown>)[`__xR${(hash >>> 0).toString(36)}`];
}

/** Adopts compatible SSR output or mounts a fresh non-document tree after reporting the mismatch. */
function adoptOrMountRoot(
	vnode: VNode,
	container: Element,
	documentNode: Document | undefined,
	hasMarkers: boolean,
	options: HydrateOptions,
	work: DomWorkBudget,
	domain: ComponentDomain
): 'adopted' | 'mounted' {
	if (documentNode) {
		const checkpoint = checkpointComponentResumptions(domain);
		if (adoptDocumentRoot(vnode, documentNode, rendererOptions(options, work))) {
			return 'adopted';
		}
		rollbackComponentResumptions(domain, checkpoint);
		reportMismatch(
			options,
			'server document did not match the authored client document',
			'adoption-mismatch'
		);
		throw new Error(
			'eXact cannot safely replace a mismatched Document root; reload the document or correct the authored root.'
		);
	}
	if (!hasMarkers) {
		const checkpoint = checkpointComponentResumptions(domain);
		const adopted =
			options.allowMarkerless && typeof vnode.type === 'function'
				? adoptMarkerlessComponentRoot(vnode, container, rendererOptions(options, work))
				: false;
		if (adopted) {
			return 'adopted';
		}
		rollbackComponentResumptions(domain, checkpoint);
		reportMismatch(
			options,
			options.allowMarkerless
				? 'server markup did not match the client tree'
				: 'missing exact hydration markers',
			options.allowMarkerless ? 'adoption-mismatch' : 'missing-markers'
		);
		mountFreshRoot(vnode, container, options, work);
		return 'mounted';
	}
	const checkpoint = checkpointComponentResumptions(domain);
	const adopted =
		typeof vnode.type === 'function'
			? adoptComponentRoot(vnode, container, rendererOptions(options, work))
			: adoptStaticTree(vnode, container, createStaticAdoptionBudget(options, work)) &&
				adoptStatic(vnode, container, rendererOptions(options, work));
	if (adopted) {
		return 'adopted';
	}
	rollbackComponentResumptions(domain, checkpoint);
	// Clear the SSR range before mounting so a failed adoption cannot leave a
	// duplicate interactive tree beside stale server markup.
	mountFreshRoot(vnode, container, options, work);
	return 'mounted';
}

/** Clears an unowned SSR range and mounts the client-owned replacement. */
function mountFreshRoot(
	vnode: VNode,
	container: Element,
	options: HydrateOptions,
	work: DomWorkBudget
): void {
	container.replaceChildren();
	render(vnode, container, rendererOptions(options, work));
}

/** Creates renderer options against the one shared hydration traversal budget. */
function rendererOptions(options: HydrateOptions, work: DomWorkBudget): RenderOptions {
	return {
		logger: options.logger,
		onErrorReport: options.onErrorReport,
		maxTreeDepth: options.maxTreeDepth,
		maxTreeNodes: remainingDomWork(work),
		workBudget: work,
		allowUnsafeHtml: options.allowUnsafeHtml,
		onUnsafeHtml: options.onUnsafeHtml,
		onProfile: options.onProfile,
		enhancementCatalog: options.enhancementCatalog
	};
}

/** Assigns a pre-authored root VNode to the client generation that will construct it. */
function ownedVNode(vnode: VNode, domain: ComponentDomain): VNode {
	return vnode.domain === domain ? vnode : { ...vnode, domain };
}
