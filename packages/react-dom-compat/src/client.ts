import type { ReactNode } from '@exactjs/react-compat';
import {
	createReactRendererRoot,
	disposeReactRoot,
	hydrateReactRoot,
	renderReactRoot
} from './renderer/root.js';
import type { ReactRendererRoot } from './renderer/types.js';
import './renderer/native-island.js';

/** Configures root. */
export interface RootOptions {
	identifierPrefix?: string;
	onCaughtError?: (
		error: unknown,
		info: { componentStack: string; errorBoundary?: unknown }
	) => void;
	onRecoverableError?: (error: unknown, info: { componentStack: string }) => void;
	onUncaughtError?: (error: unknown, info: { componentStack: string }) => void;
}

/** Defines the root interface contract. */
export interface Root {
	render(children: ReactNode): void;
	unmount(): void;
}

const roots = new WeakMap<Element, CompatibilityRoot>();

class CompatibilityRoot implements Root {
	private active = true;

	constructor(
		private readonly container: Element,
		private readonly options?: RootOptions,
		private readonly renderer: ReactRendererRoot = createReactRendererRoot(container, options)
	) {}

	render(children: ReactNode): void {
		if (!this.active) throw new Error('Cannot update an unmounted React compatibility root');
		renderReactRoot(this.renderer, children);
	}

	unmount(): void {
		if (!this.active) return;
		this.active = false;
		roots.delete(this.container);
		disposeReactRoot(this.renderer);
	}
}

/** Creates a root. */
export function createRoot(container: Element | DocumentFragment, _options?: RootOptions): Root {
	if (!(container instanceof Element)) {
		throw new TypeError(
			'eXact React compatibility Phase 1 createRoot requires an Element container'
		);
	}
	if (roots.has(container))
		throw new Error('createRoot has already been called for this container');
	const root = new CompatibilityRoot(container, _options);
	roots.set(container, root);
	return root;
}

/** Performs the hydrate root domain operation. */
export function hydrateRoot(
	container: Element | DocumentFragment,
	initialChildren: ReactNode,
	options?: RootOptions
): Root {
	if (!(container instanceof Element)) {
		throw new TypeError('eXact React compatibility hydrateRoot requires an Element container');
	}
	if (roots.has(container))
		throw new Error('A React compatibility root already owns this container');
	const renderer = createReactRendererRoot(container, options);
	hydrateReactRoot(renderer, initialChildren);
	const root = new CompatibilityRoot(container, options, renderer);
	roots.set(container, root);
	return root;
}

/** Internal bridge for React 18's deprecated main-entrypoint renderer. */
export function legacyRender(children: ReactNode, container: Element, callback?: () => void): null {
	let root = roots.get(container);
	if (!root) {
		root = new CompatibilityRoot(container);
		roots.set(container, root);
	}
	root.render(children);
	callback?.();
	return null;
}

/** Internal bridge for React 18's deprecated main-entrypoint hydration API. */
export function legacyHydrate(
	children: ReactNode,
	container: Element,
	callback?: () => void
): null {
	let root = roots.get(container);
	if (!root) root = hydrateRoot(container, children) as CompatibilityRoot;
	else root.render(children);
	callback?.();
	return null;
}

/** Internal bridge for React 18's deprecated main-entrypoint unmount API. */
export function legacyUnmount(container: Element): boolean {
	const root = roots.get(container);
	if (!root) return false;
	root.unmount();
	return true;
}

/** Provides the canonical version value. */
export const version = '19.2.0-exact';

export default { createRoot, hydrateRoot, version };
