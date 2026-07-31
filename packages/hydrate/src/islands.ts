import {
	createServerSlot,
	createComponentDomain,
	createVNode,
	decodeReactiveProtocolValue,
	logFrameworkEvent,
	withComponentDomain,
	type ComponentFunction
} from '@exactjs/core';
import {
	adoptMarkerlessComponentRoot,
	consumeDomWork,
	createDomWorkBudget,
	findNodeOwnerInstance,
	render,
	synchronizeFormBinding,
	walkDomSubtree
} from '@exactjs/dom';
import { captureHydrationDom, restoreFormState } from './adoption/form-state.js';
import { disposeInteractionHydration, ensureInteractionHydration } from './islands/interaction.js';
import { isClientIslandLoader, loadClientIsland } from './islands/loading.js';
import { isSafeObjectKey } from './safety.js';
import type { ClientIslandRegistry, HydrateOptions } from './types.js';
import { isJsonSafe } from './validation.js';
import { roots } from './runtime/state.js';
import {
	checkpointComponentResumptions,
	rollbackComponentResumptions
} from './runtime/resumption.js';

/** Hydrates all unhydrated client island boundaries found under a container. */
export function hydrateClientIslands(
	container: Element | Document,
	registry: ClientIslandRegistry,
	options: HydrateOptions = {}
): number {
	let hydrated = 0;
	const attempted = new Set<Element>();
	const work = createDomWorkBudget(options.maxTreeNodes);
	const boundaries: Element[] = [];
	const rootContainer =
		container.nodeType === 9 ? (container as Document).documentElement : container;
	const domain =
		options.componentDomain ??
		(rootContainer instanceof Element ? roots.get(rootContainer)?.domain : undefined) ??
		createComponentDomain(options.executionRoot ?? 'page');
	const enqueue = (root: Node) =>
		walkDomSubtree(
			root,
			(node) => {
				if (
					node instanceof Element &&
					node.hasAttribute('data-exact-client-boundary') &&
					!attempted.has(node)
				)
					boundaries.push(node);
			},
			{ budget: work }
		);
	enqueue(container);
	let dormant = false;
	for (let index = 0; index < boundaries.length; index++) {
		const boundary = boundaries[index]!;
		if (
			!container.contains(boundary) ||
			boundary.getAttribute('data-exact-client-hydrated') === 'true' ||
			attempted.has(boundary)
		)
			continue;
		const parent = boundary.parentElement?.closest('[data-exact-client-boundary]');
		if (parent && parent.getAttribute('data-exact-client-hydrated') !== 'true') continue;
		if (shouldDeferIsland(boundary, options)) {
			dormant = true;
			continue;
		}
		attempted.add(boundary);
		const result = hydrateIslandBoundary(boundary, registry, options, work, domain);
		if (result === true) {
			hydrated++;
			enqueue(boundary);
		} else if (result instanceof Promise) {
			void result
				.then((mounted) => {
					if (mounted && container.contains(boundary))
						hydrateClientIslands(boundary, registry, { ...options, componentDomain: domain });
				})
				.catch((error) =>
					logFrameworkEvent(
						'error',
						'hydrate',
						'island',
						'client island loading failed',
						error,
						options.logger
					)
				);
		}
	}
	if (dormant)
		ensureInteractionHydration(
			container,
			(boundary, event) =>
				hydrateIslandChain(
					boundary,
					registry,
					options,
					createDomWorkBudget(options.maxTreeNodes),
					domain,
					event
				),
			options
		);
	else disposeInteractionHydration(container);
	return hydrated;
}

function hydrateIslandChain(
	boundary: Element,
	registry: ClientIslandRegistry,
	options: HydrateOptions,
	work: ReturnType<typeof createDomWorkBudget>,
	domain: ReturnType<typeof createComponentDomain>,
	activationEvent?: Event
): boolean | Promise<boolean> {
	const parent = boundary.parentElement?.closest('[data-exact-client-boundary]');
	if (parent && parent.getAttribute('data-exact-client-hydrated') !== 'true') {
		const parentResult = hydrateIslandChain(parent, registry, options, work, domain);
		if (parentResult instanceof Promise)
			return parentResult.then((hydrated) =>
				hydrated
					? hydrateIslandBoundary(boundary, registry, options, work, domain, activationEvent)
					: false
			);
		if (!parentResult) return false;
	}
	return hydrateIslandBoundary(boundary, registry, options, work, domain, activationEvent);
}

function hydrateIslandBoundary(
	boundary: Element,
	registry: ClientIslandRegistry,
	options: HydrateOptions,
	work: ReturnType<typeof createDomWorkBudget>,
	domain: ReturnType<typeof createComponentDomain>,
	activationEvent?: Event
): boolean | Promise<boolean> {
	if (boundary.getAttribute('data-exact-client-hydrated') === 'true') return true;
	const name = boundary.getAttribute('data-exact-client-name');
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
	if (isClientIslandLoader(entry))
		return loadClientIsland(entry, options).then((component) => {
			registry[name] = component;
			if (!boundary.isConnected && !boundary.parentNode) return false;
			return mountIslandBoundary(boundary, name, component, options, work, domain, activationEvent);
		});
	return mountIslandBoundary(boundary, name, entry, options, work, domain, activationEvent);
}

function mountIslandBoundary(
	boundary: Element,
	name: string,
	component: ComponentFunction<any, any>,
	options: HydrateOptions,
	work: ReturnType<typeof createDomWorkBudget>,
	domain: ReturnType<typeof createComponentDomain>,
	activationEvent?: Event
): boolean {
	if (boundary.getAttribute('data-exact-client-hydrated') === 'true') return true;
	const props = parseIslandProps(boundary.getAttribute('data-exact-client-props'), options);
	const vnode = withComponentDomain(domain, () => createVNode(component, props));
	const remaining = work.limit - work.used;
	if (remaining <= 0) consumeDomWork(work);
	const rendererOptions = {
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
	const resumption =
		boundary.getAttribute('data-exact-client-resumption') === 'true' &&
		boundary.childNodes.length > 0;
	const adopting = interaction || resumption;
	const captured = adopting ? captureHydrationDom(boundary, work) : undefined;
	const checkpoint = adopting ? checkpointComponentResumptions(domain) : 0;
	const adopted = adopting ? adoptMarkerlessComponentRoot(vnode, boundary, rendererOptions) : false;
	if (!adopted) {
		if (adopting) rollbackComponentResumptions(domain, checkpoint);
		if (adopting) boundary.replaceChildren();
		render(vnode, boundary, rendererOptions);
	}
	if (captured)
		for (const control of restoreFormState(boundary, captured.formState, work))
			if (
				activationEvent?.target !== control ||
				(activationEvent.type !== 'input' && activationEvent.type !== 'change')
			)
				synchronizeFormBinding(control);
	boundary.setAttribute('data-exact-client-hydrated', 'true');
	options.onHydration?.(
		Object.freeze({
			kind: 'island',
			outcome: adopted ? 'adopted' : 'mounted',
			component: name,
			markers: adopted ? 'markerless' : 'none'
		})
	);
	return true;
}

function shouldDeferIsland(boundary: Element, options: HydrateOptions): boolean {
	if (options.hydration?.strategy === 'eager') return false;
	return boundary.getAttribute('data-exact-client-hydration') === 'interaction';
}

function parseIslandProps(raw: string | null, options: HydrateOptions): Record<string, unknown> {
	if (!raw) return {};
	try {
		const maxBytes = positiveLimit(options.configLimits?.maxBytes, 16 * 1024 * 1024);
		if (new TextEncoder().encode(raw).byteLength > maxBytes) return {};
		const encoded = JSON.parse(raw);
		if (
			!isJsonSafe(encoded, {
				maxDepth: positiveLimit(options.configLimits?.maxDepth, 100),
				maxNodes: positiveLimit(options.configLimits?.maxNodes, 100_000),
				maxBytes
			})
		)
			return {};
		const parsed = decodeReactiveProtocolValue(encoded);
		if (
			!parsed ||
			typeof parsed !== 'object' ||
			Array.isArray(parsed) ||
			!isJsonSafe(parsed, {
				maxDepth: positiveLimit(options.configLimits?.maxDepth, 100),
				maxNodes: positiveLimit(options.configLimits?.maxNodes, 100_000),
				maxBytes
			})
		)
			return {};
		const props = (parsed as Record<string, unknown>).props;
		return props && typeof props === 'object' && !Array.isArray(props)
			? (reviveServerSlots(props) as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function positiveLimit(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function reviveServerSlots(value: unknown): unknown {
	if (!value || typeof value !== 'object') return value;
	const rootSlot = serverSlot(value);
	if (rootSlot) return rootSlot;
	const root: any = Array.isArray(value) ? new Array(value.length) : {};
	const pending: Array<{ source: any; target: any }> = [{ source: value, target: root }];
	while (pending.length) {
		const { source, target } = pending.pop()!;
		for (const key of Object.keys(source)) {
			if (!Array.isArray(source) && !isSafeObjectKey(key)) continue;
			const child = source[key];
			if (!child || typeof child !== 'object') {
				target[key] = child;
				continue;
			}
			const slot = serverSlot(child);
			if (slot) {
				target[key] = slot;
				continue;
			}
			const revived: any = Array.isArray(child) ? new Array(child.length) : {};
			target[key] = revived;
			pending.push({ source: child, target: revived });
		}
	}
	return root;
}

function serverSlot(value: object): ReturnType<typeof createServerSlot> | undefined {
	const record = value as Record<string, unknown>;
	return typeof record.__exactServerSlot === 'string'
		? createServerSlot(record.__exactServerSlot)
		: undefined;
}
