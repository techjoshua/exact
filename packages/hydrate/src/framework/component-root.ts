import {
	admitCompiledComponentInput,
	clientComponentRecipe
} from '@exactjs/dom/framework/component-root';
import {
	activateHydrationWhenReady,
	cancelPendingRootHydration
} from '../runtime/registry-readiness.js';
import type { Child } from '@exactjs/core';
import {
	adoptCompiledComponentInputRoot,
	createComponentRootAdoption,
	adoptDocumentCompiledComponentInputRoot,
	adoptMarkerlessCompiledComponentInputRoot,
	createDomWorkBudget,
	renderCompiledComponentInputRoot,
	synchronizeFormBinding,
	type DomWorkBudget,
	type RenderOptions
} from '@exactjs/dom/framework/component-root';
import { publishExactProfile } from '@exactjs/instrumentation';
import { captureHydrationDom, restoreFormState } from '../adoption/form-state.js';
import { reportMismatch } from '../mismatch.js';
import { resolveRootHydrateOptions } from '../root-config.js';
import { assertCurrentDocumentContainer } from '../runtime/current-document.js';
import { createHydrationOnlyClient } from '../runtime/root-client.js';
import { deferHydrationAfterNavigation } from '../runtime/deferred-hydration.js';
import {
	checkpointComponentResumptions,
	rollbackComponentResumptions,
	withComponentResumptionFallback
} from '../runtime/resumption.js';
import { roots, ownHydrationDomRoot, acceptHydrationDomRoot } from '../runtime/state.js';
import type { CoreHydrationRoot, HydrateOptions, HydrateProfileEvent } from '../types.js';
import { hydrationPhaseProfiling } from '../profiling-policy.js';
export { readPublishedRootProps } from '../root-config.js';

/**
 * Hydrates a compiler-issued native component root without generic tree classification.
 * The root is returned immediately. Await `whenSettled()` for selected lazy imports and adoption.
 */
export function hydrateCompiledComponentInputRoot(
	operation: Child,
	container: Element | Document,
	options: HydrateOptions = {}
): CoreHydrationRoot {
	assertCurrentDocumentContainer(container);
	const documentNode =
		container.nodeType === Node.DOCUMENT_NODE ? (container as Document) : undefined;
	const rootContainer = documentNode?.documentElement ?? (container as Element);
	const receipt = clientComponentRecipe(admitCompiledComponentInput(operation));
	if (!receipt)
		throw new TypeError('Compiled hydration root requires a compiler-issued component operation');
	const adoption = createComponentRootAdoption(rootContainer);
	const existing = roots.get(rootContainer);
	if (existing) {
		cancelPendingRootHydration(existing, container);
		if (!adoption.isCurrent()) return existing;
		renderCompiledComponentInputRoot(
			operation,
			rootContainer,
			domOptions(options, undefined, existing.domain),
			adoption
		);
		if (!adoption.isCurrent()) return existing;
		acceptHydrationDomRoot(existing, rootContainer);
		rootContainer.setAttribute('data-exact-hydrated', 'true');
		options.onHydration?.({ kind: 'root', outcome: 'updated', markers: 'none' });
		return existing;
	}
	const started = options.onProfile ? performance.now() : undefined;
	const resolved = resolveRootHydrateOptions(rootContainer, options);
	const clientStarted =
		hydrationPhaseProfiling && resolved.onProfile ? performance.now() : undefined;
	const client = createHydrationOnlyClient(rootContainer, resolved);
	ownHydrationDomRoot(client, () => adoption.isCurrent());
	reportHydrationPhase(resolved, 'create-client', clientStarted);
	if (!adoption.isCurrent()) return client;
	const work = createDomWorkBudget(resolved.maxTreeNodes);
	let handoffComplete = false;
	const activate = () => {
		try {
			if (!adoption.isCurrent()) return client;
			const captureStarted =
				hydrationPhaseProfiling && resolved.onProfile ? performance.now() : undefined;
			const captured = captureHydrationDom(rootContainer, work);
			reportHydrationPhase(resolved, 'capture-dom', captureStarted);
			if (!adoption.isCurrent()) return client;
			const checkpoint = checkpointComponentResumptions(client.domain);
			const adoptionStarted =
				hydrationPhaseProfiling && resolved.onProfile ? performance.now() : undefined;
			const adopted = documentNode
				? adoptDocumentCompiledComponentInputRoot(
						operation,
						documentNode,
						domOptions(resolved, work),
						adoption
					)
				: resolved.markerlessRoot
					? adoptMarkerlessCompiledComponentInputRoot(
							operation,
							rootContainer,
							domOptions(resolved, work),
							adoption
						)
					: captured.hasMarkers
						? adoptCompiledComponentInputRoot(
								operation,
								rootContainer,
								domOptions(resolved, work),
								adoption
							)
						: resolved.allowMarkerless
							? adoptMarkerlessCompiledComponentInputRoot(
									operation,
									rootContainer,
									domOptions(resolved, work),
									adoption
								)
							: adoption;
			reportHydrationPhase(resolved, 'adopt-dom', adoptionStarted);
			if (adopted.outcome === 'superseded' || !adoption.isCurrent()) return client;
			let outcome: 'adopted' | 'mounted' = 'adopted';
			if (adopted.outcome === 'mismatch') {
				rollbackComponentResumptions(client.domain, checkpoint);
				reportMismatch(
					resolved,
					captured.hasMarkers
						? 'server markup did not match the client component'
						: 'missing exact hydration markers',
					captured.hasMarkers ? 'adoption-mismatch' : 'missing-markers'
				);
				if (!adoption.isCurrent()) return client;
				if (documentNode)
					throw new Error(
						'eXact cannot safely replace a mismatched Document root; reload the document or correct the authored root.'
					);
				rootContainer.replaceChildren();
				if (!adoption.isCurrent()) return client;
				withComponentResumptionFallback(client.domain, () =>
					renderCompiledComponentInputRoot(
						operation,
						rootContainer,
						domOptions(resolved, work),
						adoption
					)
				);
				outcome = 'mounted';
			}
			if (!adoption.isCurrent()) return client;
			const restorationStarted =
				hydrationPhaseProfiling && resolved.onProfile ? performance.now() : undefined;
			for (const control of restoreFormState(
				rootContainer,
				captured.formState,
				work,
				adoption.isCurrent
			)) {
				if (!adoption.isCurrent()) return client;
				synchronizeFormBinding(control);
			}
			reportHydrationPhase(resolved, 'restore-controls', restorationStarted);
			if (!adoption.isCurrent()) return client;
			rootContainer.setAttribute('data-exact-hydrated', 'true');
			resolved.onHydration?.({
				kind: 'root',
				outcome,
				markers: documentNode
					? 'document'
					: resolved.markerlessRoot
						? 'markerless'
						: captured.hasMarkers
							? 'exact'
							: resolved.allowMarkerless
								? 'markerless'
								: 'none'
			});
			if (handoffComplete && adoption.isCurrent()) acceptHydrationDomRoot(client, rootContainer);
			return client;
		} catch (error) {
			client.dispose();
			throw error;
		}
	};
	try {
		return activateHydrationWhenReady(client, rootContainer, resolved, work, activate);
	} finally {
		if (started !== undefined)
			publishExactProfile(options.onProfile, {
				subsystem: 'hydrate',
				phase: 'hydrate',
				elapsedMs: performance.now() - started
			} satisfies HydrateProfileEvent);
		handoffComplete = true;
		if (adoption.isCurrent()) acceptHydrationDomRoot(client, rootContainer);
	}
}

/** Publishes one optional compiled-root hydration phase without timing the disabled path. */
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
	} satisfies HydrateProfileEvent);
}

/** Defers compiled component hydration until navigation startup yields or interaction begins. */
export function hydrateCompiledComponentInputRootAfterNavigation(
	operation: Child | (() => Child),
	container: Element,
	options: HydrateOptions = {}
): Promise<CoreHydrationRoot> {
	try {
		assertCurrentDocumentContainer(container);
	} catch (error) {
		return Promise.reject(error);
	}
	return deferHydrationAfterNavigation(
		() =>
			hydrateCompiledComponentInputRoot(
				typeof operation === 'function' ? operation() : operation,
				container,
				options
			),
		container
	);
}

function domOptions(
	options: HydrateOptions,
	work?: DomWorkBudget,
	domain = options.componentDomain
): RenderOptions {
	return {
		logger: options.logger,
		onErrorReport: options.onErrorReport,
		maxTreeDepth: options.maxTreeDepth,
		maxTreeNodes: options.maxTreeNodes,
		allowUnsafeHtml: options.allowUnsafeHtml,
		onUnsafeHtml: options.onUnsafeHtml,
		onProfile: options.onProfile,
		enhancementCatalog: options.enhancementCatalog,
		componentDomain: domain,
		...(work ? { workBudget: work } : {})
	};
}
