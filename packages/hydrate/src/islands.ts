import {
	createServerSlot,
	createComponentDomain,
	createVNode,
	decodeReactiveProtocolValue,
	logFrameworkEvent,
	withComponentDomain
} from '@exactjs/core';
import {
	consumeDomWork,
	createDomWorkBudget,
	findNodeOwnerInstance,
	render,
	walkDomSubtree
} from '@exactjs/dom';
import { isSafeObjectKey } from './safety.js';
import type { ClientIslandRegistry, HydrateOptions } from './types.js';
import { isJsonSafe } from './validation.js';

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
	const domain = options.componentDomain ?? createComponentDomain(options.executionRoot ?? 'page');
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
		attempted.add(boundary);
		const name = boundary.getAttribute('data-exact-client-name');
		if (!name) continue;
		const component = registry[name];
		if (!component) {
			logFrameworkEvent(
				'warn',
				'hydrate',
				'island',
				`missing client island ${name}`,
				undefined,
				options.logger
			);
			continue;
		}
		const props = parseIslandProps(boundary.getAttribute('data-exact-client-props'), options);
		const remaining = work.limit - work.used;
		if (remaining <= 0) consumeDomWork(work);
		render(
			withComponentDomain(domain, () => createVNode(component, props)),
			boundary,
			{
				logger: options.logger,
				maxTreeDepth: options.maxTreeDepth,
				maxTreeNodes: remaining,
				workBudget: work,
				logicalParent: findNodeOwnerInstance(boundary)
			}
		);
		boundary.setAttribute('data-exact-client-hydrated', 'true');
		options.onHydration?.(
			Object.freeze({
				kind: 'island',
				outcome: 'mounted',
				component: name,
				markers: 'none'
			})
		);
		hydrated++;
		enqueue(boundary);
	}
	return hydrated;
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
