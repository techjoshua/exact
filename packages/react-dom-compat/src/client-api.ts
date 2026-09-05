import { findComponentDomNode } from '@exactjs/dom';
import type { Key, ReactNode, ReactPortal } from '@exactjs/react-compat';
import {
	exactComponentForReactInstance,
	isUnmountedReactClassInstance
} from '@exactjs/react-compat/exact';
import { batch, flushSync as flushExact } from '@exactjs/reactive';
import {
	createRoot as createClientRoot,
	hydrateRoot as hydrateClientRoot,
	legacyHydrate,
	legacyRender,
	legacyUnmount,
	type Root,
	type RootOptions
} from './client.js';
import { resolveReactComponentDomNode } from './renderer/component-dom-node.js';

/** Identifies the React DOM compatibility version implemented by eXact. */
export const version = '19.2.0-exact';

/** Runs a callback and synchronously flushes compatibility updates before returning. */
export function flushSync<T>(callback?: () => T): T | undefined {
	let result: T | undefined;
	try {
		result = callback?.();
	} finally {
		flushExact();
	}
	return result;
}

/** Batches reactive notifications produced by a callback. */
export function unstable_batchedUpdates<T>(callback: () => T): T {
	return batch(callback);
}

/** Creates a React-compatible portal targeting an external DOM container. */
export function createPortal(
	children: ReactNode,
	container: Element | DocumentFragment,
	key?: Key | null
): ReactPortal {
	if (!(container instanceof Node)) throw new TypeError('createPortal target must be a DOM Node');
	return {
		$$typeof: Symbol.for('react.portal'),
		key: key === null || key === undefined ? null : String(key),
		children,
		containerInfo: container,
		implementation: null
	};
}

/** Resolves a mounted compatibility component or DOM value to its host node. */
export function findDOMNode(componentOrElement: unknown): Node | null {
	if (componentOrElement === null || componentOrElement === undefined) return null;
	if (componentOrElement instanceof Node) return componentOrElement;
	const owner = exactComponentForReactInstance(componentOrElement);
	if (!owner && isUnmountedReactClassInstance(componentOrElement)) return null;
	if (!owner)
		throw new TypeError('findDOMNode expected a mounted React class instance or DOM Node');
	const reactNode = resolveReactComponentDomNode(owner);
	if (reactNode.owned) return reactNode.node;
	return findComponentDomNode(owner);
}

/** Creates a concurrent React-compatible client root. */
export function createRoot(container: Element | DocumentFragment, options?: RootOptions): Root {
	return createClientRoot(container, options);
}

/** Hydrates a React-compatible tree into existing server markup. */
export function hydrateRoot(
	container: Element | DocumentFragment,
	children: ReactNode,
	options?: RootOptions
): Root {
	return hydrateClientRoot(container, children, options);
}

/** Hydrates through the legacy ReactDOM root API. */
export function hydrate(children: ReactNode, container: Element, callback?: () => void): null {
	return legacyHydrate(children, container, callback);
}

/** Renders through the legacy ReactDOM root API. */
export function render(children: ReactNode, container: Element, callback?: () => void): null {
	return legacyRender(children, container, callback);
}

/** Unmounts a legacy root, returning whether one was present. */
export function unmountComponentAtNode(container: Element): boolean {
	return legacyUnmount(container);
}

/** Reports that React's removed subtree rendering API is unsupported. */
export function unstable_renderSubtreeIntoContainer(): never {
	throw new Error(
		'unstable_renderSubtreeIntoContainer is not supported by eXact React compatibility'
	);
}
