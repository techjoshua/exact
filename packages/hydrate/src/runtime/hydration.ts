import {
	admitCompiledComponentInput,
	clientComponentRecipe
} from '@exactjs/dom/framework/component-root';
import { activateHydrationWhenReady, cancelPendingRootHydration } from './registry-readiness.js';
import { type Child, type ComponentDomain } from '@exactjs/core';
import {
	adoptCompiledComponentInputRoot,
	createComponentRootAdoption,
	type ComponentRootAdoption,
	adoptDocumentCompiledComponentInputRoot,
	adoptMarkerlessCompiledComponentInputRoot,
	consumeDomWork,
	createDomWorkBudget,
	renderCompiledComponentInputRoot,
	synchronizeFormBinding,
	type DomWorkBudget,
	type RenderOptions
} from '@exactjs/dom/framework/component-root';
import { captureHydrationDom, restoreFormState } from '../adoption/form-state.js';
import { reportMismatch } from '../mismatch.js';
import type {
	CoreHydrationRoot,
	HydrateOptions,
	HydrateProfileEvent,
	HydrationDiagnostic
} from '../types.js';
import { checkpointComponentResumptions, rollbackComponentResumptions } from './resumption.js';
import {
	roots,
	ownHydrationDomRoot,
	acceptHydrationDomRoot,
	hydrationOwnsDomRoot
} from './state.js';
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
	// The aggregate profile callback is part of the initial handoff, not a retained update.
	const handoff = { complete: false };
	let root: T | undefined;
	try {
		root = hydrateRootWithClient(
			operation,
			container,
			options,
			createClient,
			resolveOptions,
			handoff
		);
		return root;
	} finally {
		if (started !== undefined) {
			publishExactProfile(options.onProfile, {
				subsystem: 'hydrate',
				phase: 'hydrate',
				elapsedMs: performance.now() - started
			} satisfies HydrateProfileEvent);
		}
		handoff.complete = true;
		if (root && hydrationOwnsDomRoot(root))
			acceptHydrationDomRoot(
				root,
				container.nodeType === 9 ? (container as Document).documentElement : (container as Element)
			);
	}
}

/** Adopts the root DOM range, reporting mismatches before applying client mutations. */
export function hydrateRootWithClient<T extends CoreHydrationRoot>(
	operation: Child,
	container: Element | Document,
	options: HydrateOptions,
	createClient: (container: Element, options: HydrateOptions) => T,
	resolveOptions: (container: Element, options: HydrateOptions) => HydrateOptions,
	handoff = { complete: true }
): T {
	assertCurrentDocumentContainer(container);
	admitCompiledComponentInput(operation);
	const documentNode = container.nodeType === 9 ? (container as Document) : undefined;
	const rootContainer = documentNode?.documentElement ?? (container as Element);
	const adoption = createComponentRootAdoption(rootContainer);
	const existing = roots.get(rootContainer);
	if (existing) {
		cancelPendingRootHydration(existing, container);
		if (!adoption.isCurrent()) return existing as T;
		renderCompiledComponentInputRoot(
			operation,
			rootContainer,
			{
				logger: options.logger,
				onErrorReport: options.onErrorReport,
				maxTreeDepth: options.maxTreeDepth,
				maxTreeNodes: options.maxTreeNodes,
				allowUnsafeHtml: options.allowUnsafeHtml,
				onUnsafeHtml: options.onUnsafeHtml,
				onProfile: options.onProfile,
				enhancementCatalog: options.enhancementCatalog,
				componentDomain: existing.domain
			},
			adoption
		);
		if (!adoption.isCurrent()) return existing as T;
		acceptHydrationDomRoot(existing, rootContainer);
		rootContainer.setAttribute('data-exact-hydrated', 'true');
		options.onHydration?.({
			kind: 'root',
			outcome: 'updated',
			markers: 'none'
		});
		return existing as T;
	}
	const resolvedOptions = resolveOptions(rootContainer, options);
	const clientStarted =
		hydrationPhaseProfiling && resolvedOptions.onProfile ? performance.now() : undefined;
	const root = createClient(rootContainer, resolvedOptions);
	ownHydrationDomRoot(root, () => adoption.isCurrent());
	reportHydrationPhase(resolvedOptions, 'create-client', clientStarted);
	if (!adoption.isCurrent()) return root;
	const work = createDomWorkBudget(resolvedOptions.maxTreeNodes);
	const activate = () => {
		try {
			if (!adoption.isCurrent()) return root;
			const captureStarted =
				hydrationPhaseProfiling && resolvedOptions.onProfile ? performance.now() : undefined;
			const captured = captureHydrationDom(rootContainer, work);
			reportHydrationPhase(resolvedOptions, 'capture-dom', captureStarted);
			if (!adoption.isCurrent()) return root;
			const formState = captured.formState;
			const adoptionStarted =
				hydrationPhaseProfiling && resolvedOptions.onProfile ? performance.now() : undefined;
			const outcome = adoptOrMountRoot(
				operation,
				rootContainer,
				documentNode,
				captured.hasMarkers,
				resolvedOptions,
				work,
				root.domain,
				adoption
			);
			reportHydrationPhase(resolvedOptions, 'adopt-dom', adoptionStarted);
			if (outcome === 'superseded' || !adoption.isCurrent()) return root;
			const restorationStarted =
				hydrationPhaseProfiling && resolvedOptions.onProfile ? performance.now() : undefined;
			for (const control of restoreFormState(rootContainer, formState, work, adoption.isCurrent)) {
				if (!adoption.isCurrent()) return root;
				synchronizeFormBinding(control);
			}
			reportHydrationPhase(resolvedOptions, 'restore-controls', restorationStarted);
			if (!adoption.isCurrent()) return root;
			releaseProgressiveHelper(rootContainer);
			rootContainer.setAttribute('data-exact-hydrated', 'true');
			resolvedOptions.onHydration?.({
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
			});
			if (handoff.complete && adoption.isCurrent()) acceptHydrationDomRoot(root, rootContainer);
			return root;
		} catch (error) {
			root.dispose();
			throw error;
		}
	};
	return activateHydrationWhenReady(root, rootContainer, resolvedOptions, work, activate);
}

/** Publishes one optional phase observation without paying timing cost when profiling is disabled. */
function reportHydrationPhase(
	options: HydrateOptions,
	phase: HydrateProfileEvent['phase'],
	started: number | undefined
): void {
	if (!hydrationPhaseProfiling || started === undefined) return;
	publishExactProfile(options.onProfile, {
		subsystem: 'hydrate',
		phase,
		elapsedMs: performance.now() - started
	});
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

/** Reports failed root adoption before applying the requested recovery policy. */
function reportRootMismatch(
	options: HydrateOptions,
	message: string,
	code: HydrationDiagnostic['code'],
	adoption: ComponentRootAdoption
): void {
	reportMismatch(options, message, code);
	if (adoption.isCurrent() && options.onMismatch === 'throw') throw new Error(message);
}

/** Adopts compatible SSR output or mounts a fresh non-document tree after reporting the mismatch. */
function adoptOrMountRoot(
	operation: Child,
	container: Element,
	documentNode: Document | undefined,
	hasMarkers: boolean,
	options: HydrateOptions,
	work: DomWorkBudget,
	domain: ComponentDomain,
	adoption: ComponentRootAdoption
): 'adopted' | 'mounted' | 'superseded' {
	const componentReceipt = clientComponentRecipe(admitCompiledComponentInput(operation));
	if (!componentReceipt)
		throw new TypeError('Native hydration requires a compiler-issued component operation');
	if (documentNode) {
		const checkpoint = checkpointComponentResumptions(domain);
		const result = adoptDocumentCompiledComponentInputRoot(
			operation,
			documentNode,
			rendererOptions(options, work, domain),
			adoption
		);
		if (result.outcome !== 'mismatch' || !result.isCurrent())
			return result.outcome === 'adopted' && result.isCurrent() ? 'adopted' : 'superseded';
		rollbackComponentResumptions(domain, checkpoint);
		reportRootMismatch(
			options,
			'server document did not match the authored client document',
			'adoption-mismatch',
			adoption
		);
		if (!adoption.isCurrent()) return 'superseded';
		throw new Error(
			'eXact cannot safely replace a mismatched Document root; reload the document or correct the authored root.'
		);
	}
	if (!hasMarkers || options.markerlessRoot) {
		const checkpoint = checkpointComponentResumptions(domain);
		const adopted = options.allowMarkerless
			? adoptMarkerlessCompiledComponentInputRoot(
					operation,
					container,
					rendererOptions(options, work, domain),
					adoption
				)
			: adoption;
		if (adopted.outcome !== 'mismatch' || !adopted.isCurrent())
			return adopted.outcome === 'adopted' && adopted.isCurrent() ? 'adopted' : 'superseded';
		rollbackComponentResumptions(domain, checkpoint);
		reportRootMismatch(
			options,
			options.allowMarkerless
				? 'server markup did not match the client tree'
				: 'missing exact hydration markers',
			options.allowMarkerless ? 'adoption-mismatch' : 'missing-markers',
			adoption
		);
		return mountFreshRoot(operation, container, options, work, domain, adoption);
	}
	const checkpoint = checkpointComponentResumptions(domain);
	const adopted = adoptCompiledComponentInputRoot(
		operation,
		container,
		rendererOptions(options, work, domain),
		adoption
	);
	if (adopted.outcome !== 'mismatch' || !adopted.isCurrent())
		return adopted.outcome === 'adopted' && adopted.isCurrent() ? 'adopted' : 'superseded';
	rollbackComponentResumptions(domain, checkpoint);
	reportRootMismatch(
		options,
		'server markup did not match the client tree',
		'adoption-mismatch',
		adoption
	);
	// Clear the SSR range before mounting so a failed adoption cannot leave a
	// duplicate interactive tree beside stale server markup.
	return mountFreshRoot(operation, container, options, work, domain, adoption);
}

/** Clears an unowned SSR range and mounts the client-owned replacement. */
function mountFreshRoot(
	operation: Child,
	container: Element,
	options: HydrateOptions,
	work: DomWorkBudget,
	domain: ComponentDomain,
	adoption: ComponentRootAdoption
): 'mounted' | 'superseded' {
	if (!adoption.isCurrent()) return 'superseded';
	container.replaceChildren();
	if (!adoption.isCurrent()) return 'superseded';
	renderCompiledComponentInputRoot(
		operation,
		container,
		rendererOptions(options, work, domain),
		adoption
	);
	return adoption.isCurrent() ? 'mounted' : 'superseded';
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
