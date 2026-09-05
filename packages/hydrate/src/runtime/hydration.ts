import { type Child, type ComponentDomain } from '@exactjs/core';
import { readCompiledComponentReceipt } from '@exactjs/core/runtime/component-abi';
import {
	adoptCompiledComponentReceiptRoot,
	adoptDocumentCompiledComponentReceiptRoot,
	adoptMarkerlessCompiledComponentReceiptRoot,
	consumeDomWork,
	createDomWorkBudget,
	renderCompiledComponentRoot,
	synchronizeFormBinding,
	type DomWorkBudget,
	type RenderOptions
} from '@exactjs/dom/framework/component-root';
import { captureHydrationDom, restoreFormState } from '../adoption/form-state.js';
import { reportMismatch } from '../mismatch.js';
import type { CoreHydrationRoot, HydrateOptions, HydrateProfileEvent } from '../types.js';
import { checkpointComponentResumptions, rollbackComponentResumptions } from './resumption.js';
import { roots } from './state.js';
import { assertCurrentDocumentContainer } from './current-document.js';
import { publishExactProfile } from '@exactjs/instrumentation';
import { hydrationPhaseProfiling } from '../profiling-policy.js';

/** Hydrates a server-rendered container and returns ownership of its client root. */
export function hydrateWithClient<T extends CoreHydrationRoot>(
	operation: Child,
	container: Element | Document,
	options: HydrateOptions,
	createClient: (container: Element, options: HydrateOptions) => T,
	resolveOptions: (container: Element, options: HydrateOptions) => HydrateOptions
): T {
	const started = options.onProfile ? performance.now() : undefined;
	try {
		return hydrateRootWithClient(operation, container, options, createClient, resolveOptions);
	} finally {
		if (started !== undefined) {
			publishExactProfile(
				options.onProfile,
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
export function hydrateRootWithClient<T extends CoreHydrationRoot>(
	operation: Child,
	container: Element | Document,
	options: HydrateOptions,
	createClient: (container: Element, options: HydrateOptions) => T,
	resolveOptions: (container: Element, options: HydrateOptions) => HydrateOptions
): T {
	assertCurrentDocumentContainer(container);
	const documentNode = container.nodeType === 9 ? (container as Document) : undefined;
	const rootContainer = documentNode?.documentElement ?? (container as Element);
	const existing = roots.get(rootContainer);
	if (existing) {
		renderCompiledComponentRoot(operation, rootContainer, {
			logger: options.logger,
			onErrorReport: options.onErrorReport,
			maxTreeDepth: options.maxTreeDepth,
			maxTreeNodes: options.maxTreeNodes,
			allowUnsafeHtml: options.allowUnsafeHtml,
			onUnsafeHtml: options.onUnsafeHtml,
			onProfile: options.onProfile,
			enhancementCatalog: options.enhancementCatalog,
			componentDomain: existing.domain
		});
		options.onHydration?.(
			Object.freeze({
				kind: 'root',
				outcome: 'updated',
				markers: 'none'
			})
		);
		return existing as T;
	}
	const resolvedOptions = resolveOptions(rootContainer, options);
	const clientStarted =
		hydrationPhaseProfiling && resolvedOptions.onProfile ? performance.now() : undefined;
	const root = createClient(rootContainer, resolvedOptions);
	reportHydrationPhase(resolvedOptions, 'create-client', clientStarted);
	const work = createDomWorkBudget(resolvedOptions.maxTreeNodes);
	const captureStarted =
		hydrationPhaseProfiling && resolvedOptions.onProfile ? performance.now() : undefined;
	const captured = captureHydrationDom(rootContainer, work);
	reportHydrationPhase(resolvedOptions, 'capture-dom', captureStarted);
	const formState = captured.formState;
	try {
		const adoptionStarted =
			hydrationPhaseProfiling && resolvedOptions.onProfile ? performance.now() : undefined;
		const outcome = adoptOrMountRoot(
			operation,
			rootContainer,
			documentNode,
			captured.hasMarkers,
			resolvedOptions,
			work,
			root.domain
		);
		reportHydrationPhase(resolvedOptions, 'adopt-dom', adoptionStarted);
		const restorationStarted =
			hydrationPhaseProfiling && resolvedOptions.onProfile ? performance.now() : undefined;
		for (const control of restoreFormState(rootContainer, formState, work))
			synchronizeFormBinding(control);
		reportHydrationPhase(resolvedOptions, 'restore-controls', restorationStarted);
		releaseProgressiveHelper(rootContainer);
		rootContainer.setAttribute('data-exact-hydrated', 'true');
		resolvedOptions.onHydration?.(
			Object.freeze({
				kind: 'root',
				outcome,
				markers: documentNode
					? 'document'
					: resolvedOptions.markerlessRoot
						? 'markerless'
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

/** Publishes one optional phase observation without paying timing cost when profiling is disabled. */
function reportHydrationPhase(
	options: HydrateOptions,
	phase: HydrateProfileEvent['phase'],
	started: number | undefined
): void {
	if (!hydrationPhaseProfiling || started === undefined) return;
	publishExactProfile(
		options.onProfile,
		Object.freeze({ subsystem: 'hydrate', phase, elapsedMs: performance.now() - started })
	);
}

/** Returns the unconsumed portion of a shared hydration traversal budget. */
function remainingDomWork(work: DomWorkBudget): number {
	const remaining = work.limit - work.used;
	if (remaining <= 0) consumeDomWork(work);
	return remaining;
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
	operation: Child,
	container: Element,
	documentNode: Document | undefined,
	hasMarkers: boolean,
	options: HydrateOptions,
	work: DomWorkBudget,
	domain: ComponentDomain
): 'adopted' | 'mounted' {
	const componentReceipt = readCompiledComponentReceipt(operation);
	if (!componentReceipt)
		throw new TypeError('Native hydration requires a compiler-issued component operation');
	if (documentNode) {
		const checkpoint = checkpointComponentResumptions(domain);
		if (
			adoptDocumentCompiledComponentReceiptRoot(
				operation,
				componentReceipt,
				documentNode,
				rendererOptions(options, work, domain)
			)
		) {
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
	if (!hasMarkers || options.markerlessRoot) {
		const checkpoint = checkpointComponentResumptions(domain);
		const adopted = options.allowMarkerless
			? adoptMarkerlessCompiledComponentReceiptRoot(
					operation,
					componentReceipt,
					container,
					rendererOptions(options, work, domain)
				)
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
		mountFreshRoot(operation, container, options, work, domain);
		return 'mounted';
	}
	const checkpoint = checkpointComponentResumptions(domain);
	const adopted = adoptCompiledComponentReceiptRoot(
		operation,
		componentReceipt,
		container,
		rendererOptions(options, work, domain)
	);
	if (adopted) {
		return 'adopted';
	}
	rollbackComponentResumptions(domain, checkpoint);
	// Clear the SSR range before mounting so a failed adoption cannot leave a
	// duplicate interactive tree beside stale server markup.
	mountFreshRoot(operation, container, options, work, domain);
	return 'mounted';
}

/** Clears an unowned SSR range and mounts the client-owned replacement. */
function mountFreshRoot(
	operation: Child,
	container: Element,
	options: HydrateOptions,
	work: DomWorkBudget,
	domain: ComponentDomain
): void {
	container.replaceChildren();
	renderCompiledComponentRoot(operation, container, rendererOptions(options, work, domain));
}

/** Creates renderer options against the one shared hydration traversal budget. */
function rendererOptions(
	options: HydrateOptions,
	work: DomWorkBudget,
	domain: ComponentDomain
): RenderOptions {
	return {
		logger: options.logger,
		onErrorReport: options.onErrorReport,
		maxTreeDepth: options.maxTreeDepth,
		maxTreeNodes: remainingDomWork(work),
		workBudget: work,
		allowUnsafeHtml: options.allowUnsafeHtml,
		onUnsafeHtml: options.onUnsafeHtml,
		onProfile: options.onProfile,
		enhancementCatalog: options.enhancementCatalog,
		componentDomain: domain
	};
}
