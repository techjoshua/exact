import {
	createErrorReport,
	handleComponentError,
	type Component,
	type ComponentInstance,
	type ContextToken,
	type ErrorReport
} from '@exactjs/core';
import { type Reactive } from '@exactjs/reactive';
import type {
	ReactClassInstance,
	ReactClassType,
	ReactContext,
	ReactNode,
	ReactSpecialType
} from '../types.js';
import { type ContextCell } from './hook-slots.js';

import { readReactRef } from './refs.js';
import {
	LegacyReactContext,
	REACT_FORWARD_REF_TYPE,
	REACT_MEMO_TYPE,
	REACT_REF_PROP
} from './shared.js';
export { toExactNode } from './nodes.js';
export { assignReactRef } from './refs.js';
export * from './shared.js';

/** Performs the snapshot props domain operation. */
export function snapshotProps(props: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const key of Reflect.ownKeys(props)) if (typeof key === 'string') result[key] = props[key];
	return result;
}

/** Performs the class props domain operation. */
export function classProps(props: Record<string, unknown>): {
	props: Record<string, unknown>;
	ref: unknown;
} {
	const snapshot = snapshotProps(props);
	const ref = readReactRef(snapshot[REACT_REF_PROP]);
	delete snapshot[REACT_REF_PROP];
	return { props: snapshot, ref };
}

/** Reports whether react class type. */
export function isReactClassType(type: unknown): type is ReactClassType<Record<string, unknown>> {
	return (
		typeof type === 'function' && !!type.prototype && typeof type.prototype.render === 'function'
	);
}

/** Reads a class context from its source representation. */
export function readClassContext(
	component: Component<Record<string, unknown>>,
	context: ReactContext<unknown> | undefined,
	legacyTypes?: Record<string, unknown>
): unknown {
	if (!context) {
		if (!legacyTypes) return undefined;
		const inherited = readLegacyContext(component) ?? {};
		return Object.fromEntries(Object.keys(legacyTypes).map((key) => [key, inherited[key]]));
	}
	try {
		return readComponentReactContext(component, context);
	} catch {
		return context._defaultValue;
	}
}

/** Reads a legacy context from its source representation. */
export function readLegacyContext(
	component: Component<Record<string, unknown>>
): Record<string, unknown> {
	try {
		return component.getContext(LegacyReactContext) as unknown as Record<string, unknown>;
	} catch {
		return {};
	}
}

/** Reports whether error boundary. */
export function isErrorBoundary(instance: ClassLifecycles, statics: ClassStatics): boolean {
	return (
		typeof statics.getDerivedStateFromError === 'function' ||
		typeof instance.componentDidCatch === 'function'
	);
}

/** Performs the component stack domain operation. */
export function componentStack(report: ErrorReport): string {
	return report.component ? `\n    at ${report.component.name}` : '';
}

/** Performs the route class lifecycle error domain operation. */
export function routeClassLifecycleError(
	component: Component<Record<string, unknown>>,
	error: unknown,
	phase: string
): void {
	const instance = component as ComponentInstance<Record<string, unknown>>;
	handleComponentError(instance, createErrorReport(error, 'lifecycle', instance, phase));
}

/** Performs the shallow equal state domain operation. */
export function shallowEqualState(previous: unknown, next: unknown): boolean {
	if (Object.is(previous, next)) return true;
	if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object') return false;
	return shallowEqualProps(previous as Record<string, unknown>, next as Record<string, unknown>);
}

/** Defines the class statics type contract. */
export type ClassStatics = {
	contextType?: ReactContext<unknown>;
	contextTypes?: Record<string, unknown>;
	childContextTypes?: Record<string, unknown>;
	getDerivedStateFromProps?: (props: Record<string, unknown>, state: unknown) => object | null;
	getDerivedStateFromError?: (error: unknown) => object | null;
};

/** Defines the class lifecycles type contract. */
export type ClassLifecycles = ReactClassInstance<Record<string, unknown>> & {
	isPureReactComponent?: boolean;
	componentWillMount?(): void;
	UNSAFE_componentWillMount?(): void;
	componentWillReceiveProps?(props: Record<string, unknown>, context: unknown): void;
	UNSAFE_componentWillReceiveProps?(props: Record<string, unknown>, context: unknown): void;
	componentWillUpdate?(props: Record<string, unknown>, state: unknown, context: unknown): void;
	UNSAFE_componentWillUpdate?(
		props: Record<string, unknown>,
		state: unknown,
		context: unknown
	): void;
};

/** Performs the children array domain operation. */
export function childrenArray(children: ReactNode | undefined): ReactNode[] {
	return Array.isArray(children) ? children : children === undefined ? [] : [children];
}

/** Reads a component react context from its source representation. */
export function readComponentReactContext(
	component: Component<Record<string, unknown>>,
	context: ReactContext<unknown>
): unknown {
	const value = component.getContext(contextToken(context));
	return context._exactContextMode === 'value' ? value : (value as Reactive<ContextCell>).current;
}

/** Performs the context token domain operation. */
export function contextToken(context: ReactContext<any>): ContextToken<any> {
	return context._exactToken as ContextToken<any>;
}

/** Performs the context for special domain operation. */
export function contextForSpecial(special: ReactSpecialType): ReactContext<unknown> {
	const value = (special as ReactSpecialType & { _context?: unknown })._context ?? special;
	if (!value || typeof value !== 'object' || !('_exactToken' in value))
		throw new TypeError('Invalid React context object');
	return value as unknown as ReactContext<unknown>;
}

/** Performs the shallow equal props domain operation. */
export function shallowEqualProps(
	previous: Record<string, unknown>,
	next: Record<string, unknown>
): boolean {
	const previousKeys = Object.keys(previous);
	const nextKeys = Object.keys(next);
	return (
		previousKeys.length === nextKeys.length &&
		previousKeys.every(
			(key) =>
				Object.prototype.hasOwnProperty.call(next, key) && Object.is(previous[key], next[key])
		)
	);
}

/** Performs the react type name domain operation. */
export function reactTypeName(type: unknown): string {
	if (typeof type === 'function')
		return (
			(type as { displayName?: string; name?: string }).displayName ?? type.name ?? 'Anonymous'
		);
	if (type && typeof type === 'object') {
		const special = type as ReactSpecialType;
		if (special.$$typeof === REACT_FORWARD_REF_TYPE)
			return `ForwardRef(${reactTypeName(special.render)})`;
		if (special.$$typeof === REACT_MEMO_TYPE) return `Memo(${reactTypeName(special.type)})`;
	}
	return String(type);
}

/** Performs the unsupported type domain operation. */
export function unsupportedType(name: string): Error {
	return new Error(`Unsupported React component type ${name}`);
}
