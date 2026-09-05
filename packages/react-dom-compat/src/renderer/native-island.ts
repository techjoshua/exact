import type { AnyComponentInstance } from '@exactjs/core';
import { ReactRootContext, type ReactRootRuntime } from '@exactjs/react-compat/exact';
import {
	mountReactRendererComponent,
	renderReactRendererComponent
} from '@exactjs/react-compat/exact';
import { registerForeignComponentCapability } from '@exactjs/dom/runtime/foreign-components';
import { createNestedCompatibilityRangeHost } from '@exactjs/dom/runtime/compatibility-ranges';
import {
	createReactRendererRangeRoot,
	disposeReactRoot,
	hydrateReactRangeRoot,
	renderReactRoot
} from './root.js';
import type { ReactRendererRoot } from './types.js';

type IslandMounted = {
	dom: Node;
	end?: Node;
	rawNodes?: Node[];
	afterPlacement?: () => void;
};

/** Installs the React-owned renderer for the fixed compatibility island artifact. */
export function installReactNativeIslandRenderer(): void {
	registerForeignComponentCapability({
		abi: 1,
		owner: '@exactjs/react-dom-compat',
		attach(_root, mounted, _artifact, instance, parentNode) {
			const parent = parentNode ?? document.createDocumentFragment();
			const start = parent.ownerDocument!.createTextNode('');
			const end = parent.ownerDocument!.createTextNode('');
			parent.insertBefore(start, null);
			parent.insertBefore(end, null);
			mounted.dom = start;
			mounted.end = end;
			const renderer = createIslandRoot(parent, end, instance, _root, mounted);
			bindIsland(mounted, renderer, instance);
			renderIsland(mounted, renderer, instance);
			mountReactRendererComponent(instance);
		},
		hydrate(_root, mounted, _artifact, instance) {
			const end = mounted.end;
			const parent = mounted.dom.parentNode;
			if (!end || !parent) return false;
			const renderer = createIslandRoot(parent, end, instance, _root, mounted);
			bindIsland(mounted, renderer, instance);
			const output = renderReactRendererComponent(instance, () =>
				renderIsland(mounted, renderer, instance)
			);
			if (!hydrateReactRangeRoot(renderer, output, mounted.dom, end)) return false;
			refreshRawNodes(mounted);
			mountReactRendererComponent(instance);
			return true;
		}
	});
}

function createIslandRoot(
	parent: Node,
	end: Node,
	instance: AnyComponentInstance,
	root: Parameters<Parameters<typeof registerForeignComponentCapability>[0]['attach']>[0],
	mounted: Parameters<Parameters<typeof registerForeignComponentCapability>[0]['attach']>[1]
): ReactRendererRoot {
	const inheritedRuntime = instance.ambientContexts?.get(ReactRootContext.id) as
		| ReactRootRuntime
		| undefined;
	const runtime = inheritedRuntime ?? { identifierPrefix: '', nextComponentId: 0 };
	const contexts = new Map(instance.ambientContexts ?? []);
	contexts.set(ReactRootContext.id, runtime);
	return createReactRendererRangeRoot(
		parent,
		end,
		contexts,
		runtime,
		createNestedCompatibilityRangeHost(root, instance, mounted.scope)
	);
}

function bindIsland(
	mounted: IslandMounted,
	renderer: ReactRendererRoot,
	instance: AnyComponentInstance
): void {
	instance.onUnmount(() => disposeReactRoot(renderer));
	mounted.afterPlacement = () => {
		const parent = mounted.dom.parentNode;
		if (parent) renderer.container = parent;
		refreshRawNodes(mounted);
	};
}

function renderIsland(
	mounted: IslandMounted,
	renderer: ReactRendererRoot,
	instance: AnyComponentInstance
): void {
	const output = renderReactRendererComponent(instance, () =>
		renderIsland(mounted, renderer, instance)
	);
	renderReactRoot(renderer, output);
	refreshRawNodes(mounted);
}

function refreshRawNodes(mounted: IslandMounted): void {
	const nodes: Node[] = [];
	let current = mounted.dom.nextSibling;
	while (current && current !== mounted.end) {
		nodes.push(current);
		current = current.nextSibling;
	}
	mounted.rawNodes = nodes;
}

installReactNativeIslandRenderer();
