import { retainedServerSlotElements, type RevivedPartitionProps } from './partition-slots.js';
import {
	withComponentDomain,
	type AnyComponentFunction,
	type ComponentDomain
} from '@exactjs/core';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import {
	admitCompiledComponentInput,
	clientComponentRecipe,
	createComponentRootAdoption,
	adoptMarkerlessCompiledComponentInputRoot,
	renderCompiledComponentInputRoot
} from '@exactjs/dom/framework/component-root';
import {
	consumeDomWork,
	type createDomWorkBudget,
	findNodeOwnerInstance,
	synchronizeFormBinding
} from '@exactjs/dom/root';
import { captureHydrationDom, restoreFormState } from '../adoption/form-state.js';
import {
	checkpointComponentResumptions,
	rollbackComponentResumptions,
	withComponentResumptionFallback
} from '../runtime/resumption.js';
import { inspectExactPartitionInstances } from '../partition-instances.js';
import type { HydrateOptions } from '../types.js';

/** Acquires and commits one island boundary, fencing authored reentry with its receiving attempt. */
export function mountIslandBoundaryInSlice(
	boundary: Element,
	name: string,
	component: AnyComponentFunction,
	options: HydrateOptions,
	work: ReturnType<typeof createDomWorkBudget>,
	domain: ComponentDomain,
	activationEvent?: Event,
	payload?: RevivedPartitionProps
): boolean {
	if (boundary.getAttribute('data-exact-client-hydrated') === 'true') return true;
	const adoption = createComponentRootAdoption(boundary);
	const parent = boundary.parentNode,
		tree = boundary.getRootNode();
	const generation = boundary.getAttribute('data-exact-client-generation');
	const isCurrent = () =>
		adoption.isCurrent() &&
		!options.signal?.aborted &&
		boundary.parentNode === parent &&
		boundary.getRootNode() === tree &&
		boundary.getAttribute('data-exact-client-generation') === generation;
	const props = payload?.props ?? {};
	const operation = withComponentDomain(domain, () =>
		createCompiledComponentInputReceipt(component, props)
	);
	if (!isCurrent()) return false;
	const receipt = clientComponentRecipe(admitCompiledComponentInput(operation));
	if (!receipt)
		throw new TypeError('A client island must resolve to a compiled component operation');
	const remaining = work.limit - work.used;
	if (remaining <= 0) consumeDomWork(work);
	const rendererOptions = {
		enhancementCatalog: options.enhancementCatalog,
		logger: options.logger,
		onErrorReport: options.onErrorReport,
		maxTreeDepth: options.maxTreeDepth,
		maxTreeNodes: remaining,
		workBudget: work,
		logicalParent: findNodeOwnerInstance(boundary)
	};
	const interaction =
		boundary.getAttribute('data-exact-client-hydration') === 'interaction' &&
		boundary.childNodes.length > 0;
	const eagerAdoption =
		boundary.getAttribute('data-exact-client-hydration') === 'eager' &&
		boundary.childNodes.length > 0;
	const resumption =
		boundary.getAttribute('data-exact-client-resumption') === 'true' &&
		boundary.childNodes.length > 0;
	const adopting = interaction || eagerAdoption || resumption;
	const retainedSlots = retainedServerSlotElements(payload?.serverSlots ?? [], work);
	const captured = adopting ? captureHydrationDom(boundary, work) : undefined;
	const checkpoint = adopting ? checkpointComponentResumptions(domain) : 0;
	const adopted = adopting
		? adoptMarkerlessCompiledComponentInputRoot(operation, boundary, rendererOptions, adoption)
		: adoption;
	if (adopted.outcome === 'superseded' || !isCurrent()) return false;
	const wasAdopted = adopted.outcome === 'adopted';
	if (!wasAdopted) {
		if (adopting) rollbackComponentResumptions(domain, checkpoint);
		if (!isCurrent()) return false;
		// Keep only validated opaque ranges searchable while the existing remount builds its
		// replacement shell. Claimed ranges move after this cursor into the new owned output.
		const recoveryEnd = boundary.ownerDocument.createComment('eXact retained server ranges');
		try {
			if (adopting) boundary.replaceChildren(...retainedSlots, recoveryEnd);
			if (!isCurrent()) return false;
			if (adopting)
				withComponentResumptionFallback(domain, () =>
					renderCompiledComponentInputRoot(operation, boundary, rendererOptions, adoption)
				);
			else renderCompiledComponentInputRoot(operation, boundary, rendererOptions, adoption);
			// Unclaimed ranges belong to the superseded server shell. A newer receiving attempt
			// owns its own cleanup, so never remove its nodes after authored reentry.
			while (
				isCurrent() &&
				recoveryEnd.parentNode === boundary &&
				boundary.firstChild !== recoveryEnd
			)
				boundary.firstChild!.remove();
		} finally {
			recoveryEnd.remove();
		}
	}
	if (!isCurrent()) return false;
	if (captured)
		for (const control of restoreFormState(boundary, captured.formState, work, isCurrent)) {
			if (!isCurrent()) return false;
			if (
				activationEvent?.target !== control ||
				(activationEvent.type !== 'input' && activationEvent.type !== 'change')
			)
				synchronizeFormBinding(control);
		}
	if (!isCurrent()) return false;
	boundary.setAttribute('data-exact-client-hydrated', 'true');
	if (!isCurrent()) return false;
	options.onHydration?.({
		kind: 'island',
		outcome: wasAdopted ? 'adopted' : 'mounted',
		component: name,
		markers: wasAdopted ? 'markerless' : 'none'
	});
	if (!isCurrent()) return false;
	if (options.onPartitionInstances) {
		const instances = inspectExactPartitionInstances(boundary, {
			executionRoot: options.executionRoot,
			buildKey: options.buildKey,
			maxTreeNodes: options.maxTreeNodes
		});
		if (!isCurrent()) return false;
		options.onPartitionInstances(instances);
	}
	return isCurrent();
}
