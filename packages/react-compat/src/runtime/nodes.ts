import {
	Activity as ExactActivity,
	Fragment as ExactFragment,
	Suspense as ExactSuspense,
	createPortal,
	createVNode,
	isVNode,
	type Child,
	type Component,
	type ComponentFunction,
	type VNode
} from '@exactjs/core';
import { currentWorkPriority } from '@exactjs/reactive';
import {
	EXACT_COMPONENT_TYPE,
	REACT_ACTIVITY_TYPE,
	REACT_CONSUMER_TYPE,
	REACT_CONTEXT_TYPE,
	REACT_FORWARD_REF_TYPE,
	REACT_FRAGMENT_TYPE,
	REACT_LAZY_TYPE,
	REACT_MEMO_TYPE,
	REACT_PORTAL_TYPE,
	REACT_PROFILER_TYPE,
	REACT_PROVIDER_TYPE,
	REACT_REF_PROP,
	REACT_STRICT_MODE_TYPE,
	REACT_SUSPENSE_TYPE,
	ReactRootContext,
	activeHookHost,
	adaptReactType,
	childrenArray,
	contextForSpecial,
	currentReactTransitionOwnership,
	isReactClassType,
	isReactElement,
	reactCompatibilityTarget,
	reactTypeName,
	routeClassLifecycleError,
	unsupportedType,
	type ReactRootRuntime
} from '../internals.js';
import type {
	ReactComponentType,
	ReactElement,
	ReactNode,
	ReactRef,
	ReactSpecialType
} from '../types.js';
import { normalizeReactHostProps } from './host-props.js';
import { envelopeReactRef, reactRefBinding } from './refs.js';

/** Reads a react root runtime from its source representation. */
export function readReactRootRuntime(
	component: Component<Record<string, unknown>>
): ReactRootRuntime | undefined {
	try {
		return component.getContext(ReactRootContext);
	} catch {
		return undefined;
	}
}

/** Performs the to exact node domain operation. */
export function toExactNode(node: ReactNode): Child | Child[] {
	if (Array.isArray(node)) return node.map(toExactNode).flat() as Child[];
	if (
		node === null ||
		node === undefined ||
		typeof node === 'string' ||
		typeof node === 'number' ||
		typeof node === 'boolean'
	)
		return node;
	if (isVNode(node)) return node;
	if (isReactPortal(node)) {
		const children = childrenArray(node.children).map(toExactNode).flat() as Child[];
		return createPortal(node.containerInfo, ...children);
	}
	if (!isReactElement(node))
		throw new TypeError(
			`Objects are not valid as a React child (${Object.prototype.toString.call(node)})`
		);
	return reactElementToVNode(node);
}

/** Performs the react element to vnode domain operation. */
export function reactElementToVNode(element: ReactElement): VNode {
	const elementProps = element.props as Record<string, unknown> & { children?: ReactNode };
	const keyedProps: Record<string, unknown> = {
		...elementProps,
		...(element.key === null ? {} : { key: element.key })
	};
	const exactBoundary = exactComponentType(element.type);
	if (exactBoundary) {
		if (element.ref !== null && element.ref !== undefined && exactBoundary.refProp !== undefined) {
			Reflect.set(keyedProps, exactBoundary.refProp, element.ref);
		}
		if ('children' in keyedProps)
			keyedProps.children = toExactNode(elementProps.children as ReactNode);
		delete keyedProps.ref;
		return createVNode(exactBoundary.component, keyedProps);
	}
	if (typeof element.type === 'string') {
		normalizeReactHostProps(element.type, keyedProps);
		if (element.ref !== null && element.ref !== undefined)
			keyedProps.ref = reactRefBinding(element.ref as ReactRef<Element>);
		const children = childrenArray(elementProps.children).map(toExactNode).flat() as Child[];
		delete keyedProps.children;
		return createVNode(element.type, keyedProps, ...children);
	}
	if (element.type === REACT_FRAGMENT_TYPE || element.type === REACT_STRICT_MODE_TYPE) {
		const children = childrenArray(elementProps.children).map(toExactNode).flat() as Child[];
		delete keyedProps.children;
		return createVNode(ExactFragment, keyedProps, ...children);
	}
	if (element.type === REACT_SUSPENSE_TYPE) {
		keyedProps.__exactReactTransition = currentReactTransitionOwnership();
		return createVNode(ReactSuspenseBoundary, keyedProps);
	}
	if (element.type === REACT_ACTIVITY_TYPE) {
		const children = childrenArray(elementProps.children).map(toExactNode).flat() as Child[];
		delete keyedProps.children;
		return createVNode(
			ExactActivity,
			{ ...keyedProps, mode: elementProps.mode === 'hidden' ? 'parked' : 'active' },
			...children
		);
	}
	if (element.type === REACT_PROFILER_TYPE) {
		return createVNode(ReactProfilerBoundary, keyedProps);
	}
	if (typeof element.type === 'symbol')
		throw unsupportedType(element.type.description ?? String(element.type));
	// Preserve React element records across component boundaries. Converting
	// children here would break Children, cloneElement, and wrapper components.
	if (element.ref !== null && element.ref !== undefined)
		keyedProps[REACT_REF_PROP] = envelopeReactRef(element.ref);
	// `ref` is reserved by the eXact VNode runtime and must always be a
	// RefBinding. Component refs travel through the adapter-owned channel.
	delete keyedProps.ref;
	return createVNode(adaptReactType(element.type), keyedProps);
}

/** Performs the exact component type domain operation. */
export function exactComponentType(
	type: unknown
): { component: ComponentFunction<any, any>; refProp?: PropertyKey } | undefined {
	if ((typeof type !== 'function' && typeof type !== 'object') || type === null) return undefined;
	const candidate = type as {
		$$typeof?: unknown;
		exactComponent?: unknown;
		exactRefProp?: unknown;
	};
	return candidate.$$typeof === EXACT_COMPONENT_TYPE &&
		typeof candidate.exactComponent === 'function'
		? {
				component: candidate.exactComponent as ComponentFunction<any, any>,
				...(typeof candidate.exactRefProp === 'string' || typeof candidate.exactRefProp === 'symbol'
					? { refProp: candidate.exactRefProp }
					: {})
			}
		: undefined;
}

/** Runs react type with the supplied execution context. */
export function invokeReactType(
	type: ReactComponentType<any>,
	props: Record<string, unknown>,
	ref?: unknown
): ReactNode {
	if (typeof type === 'function') {
		if (isReactClassType(type)) throw new Error('React class component adapter invariant failed');
		if (reactCompatibilityTarget() === 19 && ref !== undefined) props.ref = ref;
		return (type as (props: Record<string, unknown>) => ReactNode)(props);
	}
	const special = type as ReactSpecialType;
	if (special.$$typeof === REACT_FORWARD_REF_TYPE && special.render)
		return special.render(props, ref ?? null);
	if (special.$$typeof === REACT_MEMO_TYPE && special.type)
		return invokeReactType(special.type, props, ref);
	if (special.$$typeof === REACT_LAZY_TYPE && special._init) {
		return invokeReactType(special._init(special._payload) as ReactComponentType<any>, props, ref);
	}
	if (
		special.$$typeof === REACT_PROVIDER_TYPE ||
		(special.$$typeof === REACT_CONTEXT_TYPE && 'value' in props)
	) {
		const context = contextForSpecial(special);
		activeHookHost().provide(context, props.value);
		return props.children as ReactNode;
	}
	if (special.$$typeof === REACT_CONSUMER_TYPE || special.$$typeof === REACT_CONTEXT_TYPE) {
		const context = contextForSpecial(special);
		if (typeof props.children !== 'function')
			throw new TypeError('A React context consumer requires a function child');
		return (props.children as (value: unknown) => ReactNode)(activeHookHost().context(context));
	}
	throw unsupportedType(reactTypeName(type));
}

const ReactProfilerBoundary = function ReactProfilerBoundary(
	this: Component<Record<string, unknown>>,
	props: Record<string, unknown>
) {
	let mounted = false;
	this.onMount(() => {
		mounted = true;
	});
	this.onRender(({ duration }) => {
		const callback = props.onRender;
		if (typeof callback !== 'function') return;
		const phase = mounted ? 'update' : 'mount';
		const commitTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
		queueMicrotask(() => {
			try {
				(callback as (...args: unknown[]) => void)(
					props.id,
					phase,
					duration,
					duration,
					commitTime - duration,
					commitTime
				);
			} catch (error) {
				routeClassLifecycleError(this, error, 'profiler');
			}
		});
	});
	return () => toExactNode(props.children as ReactNode);
} as ComponentFunction<Record<string, unknown>, Record<string, unknown>>;

const ReactSuspenseBoundary = function ReactSuspenseBoundary(
	this: Component<Record<string, never>>,
	props: Record<string, unknown>
) {
	return () =>
		createVNode(
			ExactSuspense,
			{
				fallback: toExactNode(props.fallback as ReactNode),
				presentation: currentWorkPriority() === 'deferred' ? 'retain' : 'replace',
				__exactTransition: props.__exactReactTransition
			},
			toExactNode(props.children as ReactNode)
		);
} as ComponentFunction<Record<string, never>, Record<string, unknown>>;

/** Reports whether react portal. */
export function isReactPortal(value: unknown): value is import('../types.js').ReactPortal {
	return (
		!!value &&
		typeof value === 'object' &&
		(value as { $$typeof?: unknown }).$$typeof === REACT_PORTAL_TYPE
	);
}
