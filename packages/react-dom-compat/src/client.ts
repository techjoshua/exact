import {
	createVNode,
	markExactComponent,
	type Component,
	type ComponentFunction,
	type ErrorReport
} from '@exactjs/core';
import { render as renderExact, unmount as unmountExact } from '@exactjs/dom';
import { hydrate as hydrateExact, type HydrationRoot } from '@exactjs/hydrate';
import type { ReactNode } from '@exactjs/react-compat';
import { ReactRootContext, toExactNode, type ReactRootRuntime } from '@exactjs/react-compat/exact';

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

type RootHostProps = { children: ReactNode; options?: RootOptions };
const RootHost = function ExactReactRoot(
	this: Component<Record<string, never>>,
	props: RootHostProps
) {
	const runtime: ReactRootRuntime = {
		identifierPrefix: props.options?.identifierPrefix ?? '',
		nextComponentId: 0,
		onCaughtError: props.options?.onCaughtError
	};
	this.setContext(ReactRootContext, runtime);
	return () => {
		runtime.onCaughtError = props.options?.onCaughtError;
		return toExactNode(props.children);
	};
} as ComponentFunction<Record<string, never>, RootHostProps>;
markExactComponent(RootHost, '@exactjs/react-dom-compat:RootHost');

class CompatibilityRoot implements Root {
	private active = true;

	constructor(
		private readonly container: Element,
		private readonly options?: RootOptions,
		private hydration?: HydrationRoot
	) {}

	render(children: ReactNode): void {
		if (!this.active) throw new Error('Cannot update an unmounted React compatibility root');
		renderExact(createVNode(RootHost, { children, options: this.options }), this.container, {
			onErrorReport: (report) => reportUncaught(this.options, report)
		});
	}

	unmount(): void {
		if (!this.active) return;
		this.active = false;
		roots.delete(this.container);
		if (this.hydration) {
			this.hydration.dispose();
			this.hydration = undefined;
		} else {
			unmountExact(this.container);
		}
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
	const vnode = createVNode(RootHost, { children: initialChildren, options });
	const hydration = hydrateExact(vnode, container, {
		allowMarkerless: true,
		onErrorReport: (report) => reportUncaught(options, report),
		onDiagnostic(diagnostic) {
			if (diagnostic.code !== 'invalid-patch' && diagnostic.code !== 'stale-response') {
				options?.onRecoverableError?.(new Error(diagnostic.message), { componentStack: '' });
			}
		}
	});
	const root = new CompatibilityRoot(container, options, hydration);
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

function reportUncaught(options: RootOptions | undefined, report: ErrorReport): void {
	const componentStack = report.component?.name ? `\n    at ${report.component.name}` : '';
	options?.onUncaughtError?.(report.error, { componentStack });
}

export default { createRoot, hydrateRoot, version };
