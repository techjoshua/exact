import type { RevivedPartitionProps } from './islands/partition-slots.js';
import { mountIslandBoundaryInSlice } from './islands/boundary-mount.js';
import { deriveRuntimeConfiguration } from '@exactjs/core/framework/configuration';
import { hydrateIslandChain, createIslandAdoptionTracker } from './islands/activation-chain.js';
import { prepareSelectedRegistries } from './runtime/registry-readiness.js';
import { createFrameworkComponentDomain } from '@exactjs/core/framework/component-domains';
import { type AnyComponentFunction, type ComponentDomain, logFrameworkEvent } from '@exactjs/core';
import { createDomWorkBudget, walkDomSubtree } from '@exactjs/dom/root';
import {
	ensureInteractionHydration,
	releaseInteractionHydrationIfSettled
} from './islands/interaction.js';
import {
	isClientIslandLoader,
	loadClientIsland,
	registerLoadedClientIsland
} from './islands/loading.js';
import { interactionEventTypes, interactionPolicyForEntry } from './islands/policies.js';
import { compactBoundaryProps, parseIslandPayload } from './islands/boundary-props.js';
import type { ClientIslandRegistry, HydrateOptions } from './types.js';
import { withComponentExecutionSlice } from '@exactjs/core/framework/component-execution';
import { prepareClientIslandExecutionSlice } from './islands/execution-slice.js';
import { roots } from './runtime/state.js';
import { trackHydrationSettlement, waitForHydrationReadiness } from './runtime/settlement.js';
import { createComponentResumptionResolver, withIslandResumptions } from './runtime/resumption.js';

/** Hydrates all unhydrated client island boundaries found under a container. */
export function hydrateClientIslands(
	container: Element | Document,
	registry: ClientIslandRegistry,
	options: HydrateOptions = {}
): number {
	const attempted = new Set<Element>();
	const work = createDomWorkBudget(options.maxTreeNodes);
	const boundaries: Element[] = [];
	const rootContainer =
		container.nodeType === 9 ? (container as Document).documentElement : container;
	const domain =
		options.componentDomain ??
		(rootContainer instanceof Element ? roots.get(rootContainer)?.domain : undefined) ??
		createFrameworkComponentDomain({
			executionRoot: options.executionRoot ?? 'page',
			inspectionActivation: 'hydration',
			resumeComponent: createComponentResumptionResolver(() => options.resumptions)
		});
	const enqueue = (root: Node) =>
		walkDomSubtree(
			root,
			(node) => {
				if (
					node instanceof Element &&
					(node.hasAttribute('data-exact-client-boundary') || node.hasAttribute('data-xh')) &&
					!attempted.has(node)
				)
					boundaries.push(node);
			},
			{ budget: work }
		);
	enqueue(container);
	let dormant = false;
	const tracker = createIslandAdoptionTracker<ReturnType<typeof createDomWorkBudget>>(
		(boundary, event, eventWork = work) =>
			hydrateIslandBoundary(boundary, registry, options, eventWork, domain, container, event)
	);
	const { adopt, pending: pendingAdoptions } = tracker;
	for (let index = 0; index < boundaries.length; index++) {
		const boundary = boundaries[index]!;
		if (
			!container.contains(boundary) ||
			boundary.getAttribute('data-exact-client-hydrated') === 'true' ||
			attempted.has(boundary)
		)
			continue;
		const parent = boundary.parentElement?.closest('[data-exact-client-boundary], [data-xh]');
		const dormantParent = parent && parent.getAttribute('data-exact-client-hydrated') !== 'true';
		// An eager descendant cannot wait for its ancestor's unrelated interaction policy.
		// Adopt that chain first, sharing pending ancestor loads with sibling descendants.
		if (shouldDeferIsland(boundary, options)) {
			dormant = true;
			continue;
		}
		attempted.add(boundary);
		const result = dormantParent
			? hydrateIslandChain(boundary, adopt, pendingAdoptions)
			: adopt(boundary);
		if (result === true) {
			enqueue(dormantParent ? parent : boundary);
		} else if (result instanceof Promise) {
			dormant = true;
			const adoption = result.then((mounted) => {
				const adoptedRoot =
					parent &&
					container.contains(parent) &&
					parent.getAttribute('data-exact-client-hydrated') === 'true'
						? parent
						: mounted && container.contains(boundary)
							? boundary
							: undefined;
				if (adoptedRoot)
					hydrateClientIslands(
						adoptedRoot,
						registry,
						deriveRuntimeConfiguration(options, () => ({ componentDomain: domain }))
					);
				releaseInteractionHydrationIfSettled(container);
			});
			trackHydrationSettlement(domain, adoption);
			void adoption.catch((error) => {
				logFrameworkEvent(
					'error',
					'hydrate',
					'island',
					'client island loading failed',
					error,
					options.logger
				);
			});
		}
	}
	if (dormant)
		ensureInteractionHydration(
			container,
			(boundary, event) => {
				const eventWork = createDomWorkBudget(options.maxTreeNodes);
				const result = hydrateIslandChain(
					boundary,
					(target, event) => adopt(target, event, eventWork),
					pendingAdoptions,
					event
				);
				if (result instanceof Promise) {
					trackHydrationSettlement(domain, result);
					return result.then((hydrated) => {
						if (hydrated) releaseHydrationTableIfUnused(container, options);
						return hydrated;
					});
				}
				if (result) releaseHydrationTableIfUnused(container, options);
				return result;
			},
			interactionEventTypes(registry),
			(boundary, target, type) =>
				interactionPolicyForBoundary(boundary, target, type, registry, options),
			options
		);
	else {
		releaseInteractionHydrationIfSettled(container);
		releaseHydrationTableIfUnused(container, options);
	}
	return tracker.synchronousAdoptions();
}

function hydrateIslandBoundary(
	boundary: Element,
	registry: ClientIslandRegistry,
	options: HydrateOptions,
	work: ReturnType<typeof createDomWorkBudget>,
	domain: ComponentDomain,
	container: Element | Document,
	activationEvent?: Event
): boolean | Promise<boolean> {
	if (options.signal?.aborted || !container.contains(boundary)) return false;
	if (boundary.getAttribute('data-exact-client-hydrated') === 'true') return true;
	const generation = boundary.getAttribute('data-exact-client-generation');
	const compact = compactBoundaryProps(boundary, options);
	const name = boundary.getAttribute('data-exact-client-name') ?? compact?.name ?? null;
	if (!name) return false;
	const entry = registry[name];
	if (!entry) {
		logFrameworkEvent(
			'warn',
			'hydrate',
			'island',
			`missing client island ${name}`,
			undefined,
			options.logger
		);
		return false;
	}
	if (compact && !boundary.hasAttribute('data-exact-client-boundary'))
		boundary.setAttribute('data-exact-client-boundary', compact.id);
	if (isClientIslandLoader(entry))
		return loadClientIsland(entry).then((component) => {
			if (
				options.signal?.aborted ||
				boundary.getAttribute('data-exact-client-generation') !== generation ||
				!container.contains(boundary)
			)
				return false;
			// Loading is shared, but registration and mounting belong to the original owner.
			registerLoadedClientIsland(component, options);
			return mountIslandBoundary(
				boundary,
				name,
				component,
				options,
				work,
				domain,
				activationEvent,
				compact
			);
		});
	return mountIslandBoundary(
		boundary,
		name,
		entry,
		options,
		work,
		domain,
		activationEvent,
		compact
	);
}

function interactionPolicyForBoundary(
	boundary: Element,
	target: Element,
	type: string,
	registry: ClientIslandRegistry,
	options: HydrateOptions
) {
	const compact = compactBoundaryProps(boundary, options);
	const name = boundary.getAttribute('data-exact-client-name') ?? compact?.name;
	const entry = name ? registry[name] : undefined;
	if (!entry) return undefined;
	return interactionPolicyForEntry(boundary, target, type, entry);
}

function mountIslandBoundary(
	boundary: Element,
	name: string,
	component: AnyComponentFunction,
	options: HydrateOptions,
	work: ReturnType<typeof createDomWorkBudget>,
	domain: ComponentDomain,
	activationEvent?: Event,
	compactPayload?: RevivedPartitionProps
): boolean | Promise<boolean> {
	const mount = () => {
		const payload = parseIslandPayload(
			boundary.getAttribute('data-exact-client-props'),
			options,
			boundary
		);
		return withIslandResumptions(domain, payload.resumptions, () =>
			withComponentExecutionSlice(prepareClientIslandExecutionSlice(component), () =>
				mountIslandBoundaryInSlice(
					boundary,
					name,
					component,
					options,
					work,
					domain,
					activationEvent,
					compactPayload ?? payload
				)
			)
		);
	};
	const pending = prepareSelectedRegistries(boundary, work);
	if (pending) {
		const generation = boundary.getAttribute('data-exact-client-generation');
		const parent = boundary.parentNode;
		const tree = boundary.getRootNode();
		return waitForHydrationReadiness(domain, pending).then(() => {
			if (
				options.signal?.aborted ||
				boundary.parentNode !== parent ||
				boundary.getRootNode() !== tree ||
				!parent ||
				boundary.getAttribute('data-exact-client-generation') !== generation
			)
				return false;
			return mount();
		});
	}
	return mount();
}

function releaseHydrationTableIfUnused(
	container: Element | Document,
	options: HydrateOptions
): void {
	if (!options.hydrationTable) return;
	if (container.querySelector('[data-xh]:not([data-exact-client-hydrated="true"])')) return;
	options.hydrationTable = undefined;
}

function shouldDeferIsland(boundary: Element, options: HydrateOptions): boolean {
	if (options.hydration?.strategy === 'eager') return false;
	return boundary.getAttribute('data-exact-client-hydration') === 'interaction';
}
