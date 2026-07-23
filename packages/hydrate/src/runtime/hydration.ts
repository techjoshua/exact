import type { VNode } from '@exactjs/core';
import {
	adoptComponentRoot,
	adoptDocumentRoot,
	adoptMarkerlessComponentRoot,
	adoptStatic,
	createDomWorkBudget,
	render
} from '@exactjs/dom';
import { captureHydrationDom, restoreFormState } from '../adoption/form-state.js';
import { adoptStaticTree, createStaticAdoptionBudget } from '../adoption/static-tree.js';
import { resolveHydrateOptions } from '../config.js';
import { reportMismatch } from '../patches.js';
import type { HydrateOptions, HydrateProfileEvent, HydrationRoot } from '../types.js';
import { createExactClient, remainingDomWork } from './client.js';
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
		render(vnode, rootContainer, {
			logger: options.logger,
			onErrorReport: options.onErrorReport,
			maxTreeDepth: options.maxTreeDepth,
			maxTreeNodes: options.maxTreeNodes,
			allowUnsafeHtml: options.allowUnsafeHtml,
			onUnsafeHtml: options.onUnsafeHtml,
			onProfile: options.onProfile
		});
		return existing;
	}
	const resolvedOptions = resolveHydrateOptions(rootContainer, options);
	const work = createDomWorkBudget(resolvedOptions.maxTreeNodes);
	const captured = captureHydrationDom(rootContainer, work);
	const formState = captured.formState;
	if (documentNode) {
		const adopted = adoptDocumentRoot(vnode, documentNode, {
			logger: resolvedOptions.logger,
			onErrorReport: resolvedOptions.onErrorReport,
			maxTreeDepth: resolvedOptions.maxTreeDepth,
			maxTreeNodes: remainingDomWork(work),
			workBudget: work,
			allowUnsafeHtml: resolvedOptions.allowUnsafeHtml,
			onUnsafeHtml: resolvedOptions.onUnsafeHtml
		});
		if (!adopted) {
			reportMismatch(
				resolvedOptions,
				'server document did not match the authored client document',
				'adoption-mismatch'
			);
			throw new Error(
				'eXact cannot safely replace a mismatched Document root; reload the document or correct the authored root.'
			);
		}
		const root = createExactClient(rootContainer, resolvedOptions);
		roots.set(rootContainer, root);
		rootContainer.setAttribute('data-exact-hydrated', 'true');
		restoreFormState(rootContainer, formState, work);
		return root;
	}
	if (!captured.hasMarkers) {
		const adopted =
			resolvedOptions.allowMarkerless && typeof vnode.type === 'function'
				? adoptMarkerlessComponentRoot(vnode, rootContainer, {
						logger: resolvedOptions.logger,
						onErrorReport: resolvedOptions.onErrorReport,
						maxTreeDepth: resolvedOptions.maxTreeDepth,
						maxTreeNodes: remainingDomWork(work),
						workBudget: work,
						allowUnsafeHtml: resolvedOptions.allowUnsafeHtml,
						onUnsafeHtml: resolvedOptions.onUnsafeHtml
					})
				: false;
		if (adopted) {
			const root = createExactClient(rootContainer, resolvedOptions);
			roots.set(rootContainer, root);
			rootContainer.setAttribute('data-exact-hydrated', 'true');
			restoreFormState(rootContainer, formState, work);
			return root;
		}
		reportMismatch(
			resolvedOptions,
			resolvedOptions.allowMarkerless
				? 'server markup did not match the client tree'
				: 'missing exact hydration markers',
			resolvedOptions.allowMarkerless ? 'adoption-mismatch' : 'missing-markers'
		);
		rootContainer.replaceChildren();
		render(vnode, rootContainer, {
			logger: resolvedOptions.logger,
			onErrorReport: resolvedOptions.onErrorReport,
			maxTreeDepth: resolvedOptions.maxTreeDepth,
			maxTreeNodes: remainingDomWork(work),
			workBudget: work,
			allowUnsafeHtml: resolvedOptions.allowUnsafeHtml,
			onUnsafeHtml: resolvedOptions.onUnsafeHtml,
			onProfile: options.onProfile
		});
	} else {
		if (
			typeof vnode.type === 'function'
				? adoptComponentRoot(vnode, rootContainer, {
						logger: resolvedOptions.logger,
						onErrorReport: resolvedOptions.onErrorReport,
						maxTreeDepth: resolvedOptions.maxTreeDepth,
						maxTreeNodes: remainingDomWork(work),
						workBudget: work,
						allowUnsafeHtml: resolvedOptions.allowUnsafeHtml,
						onUnsafeHtml: resolvedOptions.onUnsafeHtml
					})
				: adoptStaticTree(
						vnode,
						rootContainer,
						createStaticAdoptionBudget(resolvedOptions, work)
					) &&
					adoptStatic(vnode, rootContainer, {
						logger: resolvedOptions.logger,
						onErrorReport: resolvedOptions.onErrorReport,
						maxTreeDepth: resolvedOptions.maxTreeDepth,
						maxTreeNodes: remainingDomWork(work),
						workBudget: work,
						allowUnsafeHtml: resolvedOptions.allowUnsafeHtml,
						onUnsafeHtml: resolvedOptions.onUnsafeHtml
					})
		) {
			const root = createExactClient(rootContainer, resolvedOptions);
			roots.set(rootContainer, root);
			rootContainer.setAttribute('data-exact-hydrated', 'true');
			restoreFormState(rootContainer, formState, work);
			return root;
		}
		// The DOM renderer currently mounts a new mounted graph.  Clear the SSR
		// range first so a hydration attempt cannot leave duplicate interactive
		// markup behind while marker adoption is unavailable for a boundary.
		rootContainer.replaceChildren();
		render(vnode, rootContainer, {
			logger: resolvedOptions.logger,
			onErrorReport: resolvedOptions.onErrorReport,
			maxTreeDepth: resolvedOptions.maxTreeDepth,
			maxTreeNodes: remainingDomWork(work),
			workBudget: work,
			allowUnsafeHtml: resolvedOptions.allowUnsafeHtml,
			onUnsafeHtml: resolvedOptions.onUnsafeHtml,
			onProfile: options.onProfile
		});
	}

	restoreFormState(rootContainer, formState, work);

	const root = createExactClient(rootContainer, resolvedOptions);
	roots.set(rootContainer, root);
	rootContainer.setAttribute('data-exact-hydrated', 'true');
	return root;
}
