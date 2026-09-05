import type { Child } from '@exactjs/core';
import { readCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import {
	adoptCompiledComponentReceiptRoot,
	adoptDocumentCompiledComponentReceiptRoot,
	adoptMarkerlessCompiledComponentReceiptRoot,
	createDomWorkBudget,
	renderCompiledComponentRoot,
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
import { roots } from '../runtime/state.js';
import type { CoreHydrationRoot, HydrateOptions, HydrateProfileEvent } from '../types.js';
import { hydrationPhaseProfiling } from '../profiling-policy.js';
export { readPublishedRootProps } from '../root-config.js';

/** Hydrates a compiler-issued native component root without generic tree classification. */
export function hydrateCompiledComponentRoot(
	operation: Child,
	container: Element | Document,
	options: HydrateOptions = {}
): CoreHydrationRoot {
	assertCurrentDocumentContainer(container);
	const documentNode =
		container.nodeType === Node.DOCUMENT_NODE ? (container as Document) : undefined;
	const rootContainer = documentNode?.documentElement ?? (container as Element);
	const receipt = readCompiledComponentReceipt(operation);
	if (!receipt)
		throw new TypeError('Compiled hydration root requires a compiler-issued component operation');
	const existing = roots.get(rootContainer);
	if (existing) {
		renderCompiledComponentRoot(operation, rootContainer, domOptions(options));
		options.onHydration?.({ kind: 'root', outcome: 'updated', markers: 'none' });
		return existing;
	}
	const started = options.onProfile ? performance.now() : undefined;
	const resolved = resolveRootHydrateOptions(rootContainer, options);
	const clientStarted =
		hydrationPhaseProfiling && resolved.onProfile ? performance.now() : undefined;
	const client = createHydrationOnlyClient(rootContainer, resolved);
	reportHydrationPhase(resolved, 'create-client', clientStarted);
	const work = createDomWorkBudget(resolved.maxTreeNodes);
	const captureStarted =
		hydrationPhaseProfiling && resolved.onProfile ? performance.now() : undefined;
	const captured = captureHydrationDom(rootContainer, work);
	reportHydrationPhase(resolved, 'capture-dom', captureStarted);
	const checkpoint = checkpointComponentResumptions(client.domain);
	try {
		const adoptionStarted =
			hydrationPhaseProfiling && resolved.onProfile ? performance.now() : undefined;
		const adopted = documentNode
			? adoptDocumentCompiledComponentReceiptRoot(
					operation,
					receipt,
					documentNode,
					domOptions(resolved, work)
				)
			: resolved.markerlessRoot
				? adoptMarkerlessCompiledComponentReceiptRoot(
						operation,
						receipt,
						rootContainer,
						domOptions(resolved, work)
					)
				: captured.hasMarkers
					? adoptCompiledComponentReceiptRoot(
							operation,
							receipt,
							rootContainer,
							domOptions(resolved, work)
						)
					: resolved.allowMarkerless
						? adoptMarkerlessCompiledComponentReceiptRoot(
								operation,
								receipt,
								rootContainer,
								domOptions(resolved, work)
							)
						: false;
		reportHydrationPhase(resolved, 'adopt-dom', adoptionStarted);
		let outcome: 'adopted' | 'mounted' = 'adopted';
		if (!adopted) {
			rollbackComponentResumptions(client.domain, checkpoint);
			reportMismatch(
				resolved,
				captured.hasMarkers
					? 'server markup did not match the client component'
					: 'missing exact hydration markers',
				captured.hasMarkers ? 'adoption-mismatch' : 'missing-markers'
			);
			if (documentNode)
				throw new Error(
					'eXact cannot safely replace a mismatched Document root; reload the document or correct the authored root.'
				);
			rootContainer.replaceChildren();
			withComponentResumptionFallback(client.domain, () =>
				renderCompiledComponentRoot(operation, rootContainer, domOptions(resolved, work))
			);
			outcome = 'mounted';
		}
		const restorationStarted =
			hydrationPhaseProfiling && resolved.onProfile ? performance.now() : undefined;
		for (const control of restoreFormState(rootContainer, captured.formState, work))
			synchronizeFormBinding(control);
		reportHydrationPhase(resolved, 'restore-controls', restorationStarted);
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
		return client;
	} catch (error) {
		client.dispose();
		throw error;
	} finally {
		if (started !== undefined)
			publishExactProfile(options.onProfile, {
				subsystem: 'hydrate',
				phase: 'hydrate',
				elapsedMs: performance.now() - started
			} satisfies HydrateProfileEvent);
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
export function hydrateCompiledComponentRootAfterNavigation(
	operation: Child,
	container: Element,
	options: HydrateOptions = {}
): Promise<CoreHydrationRoot> {
	try {
		assertCurrentDocumentContainer(container);
	} catch (error) {
		return Promise.reject(error);
	}
	return deferHydrationAfterNavigation(
		() => hydrateCompiledComponentRoot(operation, container, options),
		container
	);
}

function domOptions(options: HydrateOptions, work?: DomWorkBudget): RenderOptions {
	return {
		logger: options.logger,
		onErrorReport: options.onErrorReport,
		maxTreeDepth: options.maxTreeDepth,
		maxTreeNodes: options.maxTreeNodes,
		allowUnsafeHtml: options.allowUnsafeHtml,
		onUnsafeHtml: options.onUnsafeHtml,
		onProfile: options.onProfile,
		enhancementCatalog: options.enhancementCatalog,
		componentDomain: options.componentDomain,
		...(work ? { workBudget: work } : {})
	};
}
