import type { AnyComponentInstance } from '@exactjs/core';
import type { ReactMounted } from './types.js';

const componentNodeResolvers = new WeakMap<AnyComponentInstance, () => Node | null>();

/** Associates a React-owned component instance with its renderer-owned first host node. */
export function retainReactComponentDomNode(
	instance: AnyComponentInstance,
	resolve: () => Node | null
): () => void {
	componentNodeResolvers.set(instance, resolve);
	return () => {
		if (componentNodeResolvers.get(instance) === resolve) componentNodeResolvers.delete(instance);
	};
}

/** Resolves whether the React renderer owns a component and, when mounted, its first host node. */
export function resolveReactComponentDomNode(
	instance: AnyComponentInstance
): Readonly<{ owned: boolean; node: Node | null }> {
	const resolve = componentNodeResolvers.get(instance);
	return resolve ? { owned: true, node: resolve() } : { owned: false, node: null };
}

/** Finds the first host node inside one React renderer-owned range. */
export function firstReactHostNode(mounted: ReactMounted): Node | null {
	if (mounted.kind === 'host' || mounted.kind === 'text') return mounted.dom;
	if (mounted.kind === 'native') return mounted.dom.nextSibling ?? mounted.end ?? mounted.dom;
	for (const child of mounted.children) {
		const node = firstReactHostNode(child);
		if (node) return node;
	}
	return null;
}
