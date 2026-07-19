import {
	Fragment as ExactFragment,
	SuspensionContext,
	createPortal,
	createVNode,
	isVNode,
	trackComponentAsync,
	type Child,
	type Component,
	type ComponentFunction,
	type ComponentInstance,
	type VNode
} from '@exact/core';
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

export function readReactRootRuntime(
	component: Component<Record<string, unknown>>
): ReactRootRuntime | undefined {
	try {
		return component.getContext(ReactRootContext);
	} catch {
		return undefined;
	}
}

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
		return createVNode(ReactSuspenseBoundary, keyedProps);
	}
	if (element.type === REACT_ACTIVITY_TYPE) {
		const children =
			elementProps.mode === 'hidden'
				? []
				: (childrenArray(elementProps.children).map(toExactNode).flat() as Child[]);
		delete keyedProps.children;
		return createVNode(ExactFragment, keyedProps, ...children);
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
	this: Component<{ pending: number }>,
	props: Record<string, unknown>
) {
	this.state.pending = 0;
	const pending = new Set<PromiseLike<unknown>>();
	let active = true;
	this.setContext(SuspensionContext, {
		suspend: (promise) => {
			if (!active || pending.has(promise)) return;
			pending.add(promise);
			trackComponentAsync(this as unknown as ComponentInstance<Record<string, unknown>>, promise);
			this.state.pending = pending.size;
			const settle = () => {
				if (!active || !pending.delete(promise)) return;
				this.state.pending = pending.size;
			};
			Promise.resolve(promise).then(settle, settle);
		}
	});
	this.onUnmount(() => {
		active = false;
		pending.clear();
	});
	return () => toExactNode((this.state.pending ? props.fallback : props.children) as ReactNode);
} as ComponentFunction<{ pending: number }, Record<string, unknown>>;

export function isReactPortal(value: unknown): value is import('../types.js').ReactPortal {
	return (
		!!value &&
		typeof value === 'object' &&
		(value as { $$typeof?: unknown }).$$typeof === REACT_PORTAL_TYPE
	);
}
