import { disposeReactMounts, rollbackReactMounts } from './teardown.js';
import type { AnyReactComponentType, ReactElement, ReactNode } from '@exactjs/react-compat';
import {
	constructReactRendererComponent,
	finishReactRendererComponentTransition,
	exactComponentType,
	isReactElement,
	isReactPortal,
	mountReactRendererComponent,
	reactElementCompatibilityContribution,
	receiveReactRendererComponent,
	readReactRendererComponentTransition,
	readReactRendererSuspension,
	renderReactRendererComponent,
	REACT_ACTIVITY_TYPE,
	REACT_FRAGMENT_TYPE,
	REACT_PROFILER_TYPE,
	REACT_STRICT_MODE_TYPE,
	REACT_SUSPENSE_TYPE
} from '@exactjs/react-compat/exact';
import { mountCompatibilityRange } from '@exactjs/dom/runtime/compatibility-ranges';
import type { ReactMounted, ReactRenderContext } from './types.js';
import { applyReactHostProps, finalizeReactHostProps } from './host-properties.js';
import {
	canPatchReactNode,
	dangerousHtml,
	hostNamespace,
	normalizeReactChildren,
	reactElementProps,
	type NormalizedReactNode
} from './react-node.js';
import { placeReactMounts, retargetReactMountedParent, setReactRangeHidden } from './range.js';
import { mountReactPortal } from './portal.js';
import { firstReactHostNode, retainReactComponentDomNode } from './component-dom-node.js';

/**
 * Reconciles one React-owned sibling list without entering native eXact execution.
 * Publishes the accepted child array before retiring old ranges so cleanup failure cannot orphan it.
 */
export function reconcileReactChildren(
	context: ReactRenderContext,
	previous: readonly ReactMounted[],
	value: ReactNode,
	before: Node | null = null,
	publish?: (next: ReactMounted[]) => void
): ReactMounted[] {
	const next = normalizeReactChildren(value);
	const keyed = new Map(previous.map((mounted) => [mounted.key, mounted]));
	const retained = new Set<ReactMounted>();
	const result: ReactMounted[] = [];
	const created: ReactMounted[] = [];
	try {
		for (const { node, key } of next) {
			const candidate = keyed.get(key);
			const mounted =
				candidate && canPatchReactNode(candidate, node)
					? patchReactNode(context, candidate, node)
					: mountReactNode(context, node, before);
			mounted.key = key;
			if (candidate && mounted === candidate) retained.add(candidate);
			else created.push(mounted);
			result.push(mounted);
		}
		placeReactMounts(context.parent, result, before);
	} catch (error) {
		rollbackReactMounts(created, error);
	}

	publish?.(result);
	disposeReactMounts(previous, retained);
	return result;
}

function mountReactNode(
	context: ReactRenderContext,
	node: NormalizedReactNode,
	before: Node | null
): ReactMounted {
	if (typeof node === 'string') {
		const dom = context.parent.ownerDocument!.createTextNode(node);
		context.parent.insertBefore(dom, before);
		return { kind: 'text', dom, children: [] };
	}
	if (isReactPortal(node)) return mountReactPortal(context, node, reconcileReactChildren);
	const contribution = reactElementCompatibilityContribution(node);
	if (contribution) {
		const range = mountCompatibilityRange(
			context.root.nativeHost,
			contribution,
			context.parent,
			before,
			context.owner
		);
		return {
			kind: 'native',
			dom: range.start,
			end: range.end,
			type: node.type,
			children: [],
			nativeRange: range
		};
	}
	const props = reactElementProps(node);
	if (typeof node.type === 'string') return mountHost(context, node.type, props, before);
	if (node.type === REACT_FRAGMENT_TYPE || node.type === REACT_STRICT_MODE_TYPE)
		return mountFragment(context, props.children as ReactNode, before);
	if (node.type === REACT_SUSPENSE_TYPE)
		return mountComponent(context, REACT_SUSPENSE_TYPE, props, before);
	if (node.type === REACT_ACTIVITY_TYPE) {
		const mounted = mountFragment(context, props.children as ReactNode, before, node.type, props);
		setReactRangeHidden(mounted, props.mode === 'hidden');
		return mounted;
	}
	if (exactComponentType(node.type))
		throw new TypeError('Native eXact boundaries require an opaque compatibility contribution');
	const type = (node.type === REACT_PROFILER_TYPE ? REACT_PROFILER_TYPE : node.type) as
		| AnyReactComponentType
		| symbol;
	if (typeof type === 'symbol' && type !== REACT_PROFILER_TYPE)
		throw new TypeError(`Unsupported React element type ${type.description ?? String(type)}`);
	return mountComponent(context, type, props, before);
}

function mountHost(
	context: ReactRenderContext,
	tag: string,
	props: Record<string, unknown>,
	before: Node | null
): ReactMounted {
	const document = context.parent.ownerDocument!;
	const namespace = hostNamespace(context.parent, tag);
	const dom = namespace ? document.createElementNS(namespace, tag) : document.createElement(tag);
	const mounted: ReactMounted = {
		kind: 'host',
		dom,
		type: tag,
		renderContext: context,
		props,
		children: []
	};
	try {
		applyReactHostProps(dom, {}, props, context);
		context.parent.insertBefore(dom, before);
		const html = dangerousHtml(props);
		mounted.rawHtml = html !== undefined;
		if (html !== undefined) dom.innerHTML = html;
		else
			reconcileReactChildren(
				{ ...context, parent: dom },
				[],
				props.children as ReactNode,
				null,
				(next) => (mounted.children = next)
			);
		finalizeReactHostProps(dom, props);
		return mounted;
	} catch (error) {
		return rollbackReactMounts([mounted], error);
	}
}

function mountFragment(
	context: ReactRenderContext,
	children: ReactNode,
	before: Node | null,
	type: ReactElement['type'] = REACT_FRAGMENT_TYPE,
	props: Record<string, unknown> = { children }
): ReactMounted {
	const document = context.parent.ownerDocument!;
	const start = document.createTextNode('');
	const end = document.createTextNode('');
	context.parent.insertBefore(start, before);
	context.parent.insertBefore(end, before);
	const mounted: ReactMounted = {
		kind: 'fragment',
		dom: start,
		end,
		type,
		props,
		children: []
	};
	try {
		reconcileReactChildren(context, [], children, end, (next) => (mounted.children = next));
		return mounted;
	} catch (error) {
		return rollbackReactMounts([mounted], error);
	}
}

function mountComponent(
	context: ReactRenderContext,
	type: AnyReactComponentType | symbol,
	props: Record<string, unknown>,
	before: Node | null
): ReactMounted {
	const document = context.parent.ownerDocument!;
	const start = document.createTextNode('');
	const end = document.createTextNode('');
	context.parent.insertBefore(start, before);
	context.parent.insertBefore(end, before);
	const instance = constructReactRendererComponent(
		type,
		props,
		context.owner,
		context.root.contexts
	);
	const mounted: ReactMounted = {
		kind: 'component',
		dom: start,
		end,
		type,
		props,
		children: [],
		instance,
		renderContext: { ...context }
	};
	let refreshing = false;
	let pending = false;
	const refresh = () => {
		if (mounted.disposed || !context.root.active) return;
		if (refreshing) {
			pending = true;
			return;
		}
		refreshing = true;
		try {
			let attempts = 0;
			let output: ReactNode = null;
			do {
				if (++attempts > 100)
					throw new Error(`React component reconciliation did not stabilize (${String(type)})`);
				pending = false;
				output = renderReactRendererComponent(instance, refresh);
				const transition =
					readReactRendererComponentTransition(instance) ?? mounted.renderContext?.transition;
				let suspension =
					type === REACT_SUSPENSE_TYPE ? readReactRendererSuspension(instance) : undefined;
				if (
					type === REACT_SUSPENSE_TYPE &&
					transition &&
					mounted.children.length &&
					!mounted.suspenseFallback &&
					!suspension?.suspended
				) {
					const fragment = context.parent.ownerDocument!.createDocumentFragment();
					const candidate = reconcileReactChildren(
						{ ...mounted.renderContext!, parent: fragment, owner: instance, transition },
						[],
						output
					);
					suspension = readReactRendererSuspension(instance);
					if (suspension?.suspended) {
						disposeReactMounts(candidate);
					} else {
						try {
							placeReactMounts(context.parent, candidate, mounted.end ?? null);
							for (const child of candidate) retargetReactMountedParent(child, context.parent);
						} catch (error) {
							rollbackReactMounts(candidate, error);
						}
						const previous = mounted.children;
						mounted.children = candidate;
						mounted.suspenseFallback = false;
						// Accepted content remains owned even when superseded ref cleanup fails.
						disposeReactMounts(previous);
					}
				}
				if (
					suspension?.suspended &&
					transition &&
					mounted.children.length &&
					!mounted.suspenseFallback
				) {
					if (mounted.suspenseTransition !== transition) {
						mounted.releaseSuspenseTransition?.();
						mounted.suspenseTransition = transition;
						mounted.releaseSuspenseTransition = transition.retain();
					}
				} else {
					reconcileReactChildren(
						{ ...mounted.renderContext!, owner: instance, transition },
						mounted.children,
						output,
						mounted.end ?? null,
						(next) => (mounted.children = next)
					);
					if (type === REACT_SUSPENSE_TYPE)
						mounted.suspenseFallback = suspension?.suspended === true;
					if (!suspension?.suspended) {
						mounted.releaseSuspenseTransition?.();
						delete mounted.releaseSuspenseTransition;
						delete mounted.suspenseTransition;
					}
				}
				finishReactRendererComponentTransition(instance);
			} while (pending && (type === REACT_SUSPENSE_TYPE || output !== null));
		} finally {
			refreshing = false;
			mounted.renderRevision = (mounted.renderRevision ?? 0) + 1;
		}
	};
	mounted.refresh = refresh;
	try {
		refresh();
		mounted.releaseComponentDomNode = retainReactComponentDomNode(instance, () =>
			firstReactHostNode(mounted)
		);
		mountReactRendererComponent(instance);
		return mounted;
	} catch (error) {
		return rollbackReactMounts([mounted], error);
	}
}

function patchReactNode(
	context: ReactRenderContext,
	mounted: ReactMounted,
	node: NormalizedReactNode
): ReactMounted {
	if (mounted.kind === 'text' && typeof node === 'string') {
		if (mounted.dom.nodeValue !== node) mounted.dom.nodeValue = node;
		return mounted;
	}
	if (isReactPortal(node)) {
		reconcileReactChildren(
			{ ...context, parent: mounted.portalTarget! },
			mounted.children,
			node.children,
			null,
			(next) => (mounted.children = next)
		);
		return mounted;
	}
	if (!isReactElement(node)) return mounted;
	const contribution = reactElementCompatibilityContribution(node);
	if (mounted.kind === 'native' && mounted.nativeRange && contribution) {
		mounted.nativeRange.update(contribution);
		return mounted;
	}
	const props = reactElementProps(node);
	if (mounted.kind === 'host') {
		const element = mounted.dom as Element;
		const previous = mounted.props ?? {};
		mounted.renderContext = context;
		applyReactHostProps(element, previous, props, context);
		const previousRawHtml = mounted.rawHtml;
		const html = dangerousHtml(props);
		mounted.rawHtml = html !== undefined;
		if (html !== undefined) {
			disposeReactMounts(mounted.children);
			mounted.children = [];
			if (element.innerHTML !== html) element.innerHTML = html;
		} else {
			if (previousRawHtml) element.textContent = '';
			reconcileReactChildren(
				{ ...context, parent: element },
				mounted.children,
				props.children as ReactNode,
				null,
				(next) => (mounted.children = next)
			);
		}
		mounted.props = props;
		finalizeReactHostProps(element, props);
		return mounted;
	}
	if (mounted.kind === 'fragment') {
		reconcileReactChildren(
			context,
			mounted.children,
			props.children as ReactNode,
			mounted.end ?? null,
			(next) => (mounted.children = next)
		);
		mounted.props = props;
		if (node.type === REACT_ACTIVITY_TYPE) setReactRangeHidden(mounted, props.mode === 'hidden');
		return mounted;
	}
	if (mounted.kind === 'component' && mounted.instance) {
		mounted.renderContext = { ...context };
		const revision = mounted.renderRevision;
		receiveReactRendererComponent(
			mounted.instance,
			node.type as AnyReactComponentType | symbol,
			props
		);
		mounted.props = props;
		if (mounted.renderRevision === revision) mounted.refresh?.();
		return mounted;
	}
	return mounted;
}
