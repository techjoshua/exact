import { mapReactChildren, visitReactChildren } from './child-mapping.js';
import { currentReactOwnerFrame } from '../internals.js';
import { isReactElement, reactCompatibilityTarget, reactElementSymbol } from '../runtime/shared.js';
import type { Key, ReactCompatibleComponentType, ReactElement, ReactNode } from '../types.js';

/** Creates a React-compatible element while preserving target-specific key and ref semantics. */
export function createElement<P extends object>(
	type: string | symbol | ReactCompatibleComponentType<P>,
	config?: (P & { key?: Key; ref?: unknown }) | null,
	...children: ReactNode[]
): ReactElement<P> {
	const source = config ?? ({} as P);
	const props: Record<string, unknown> = {};
	let key: string | null = null;
	let ref: unknown = null;
	for (const [name, value] of Object.entries(source)) {
		if (name === 'key') key = value === undefined ? null : String(value);
		else if (name === 'ref') ref = value;
		else props[name] = value;
	}
	if (children.length === 1) props.children = children[0];
	else if (children.length > 1) props.children = children;
	// React 19's reconciler reads refs from props. Retain the top-level field as
	// well because the eXact adapter and React 18 target consume that shape.
	if (reactCompatibilityTarget() === 19 && ref !== null) props.ref = ref;
	applyDefaultProps(type, props);
	return {
		$$typeof: reactElementSymbol(),
		type,
		key,
		ref,
		props: props as P & { children?: ReactNode },
		_owner: currentReactOwnerFrame(),
		_store: { validated: 0 }
	};
}

/** Clones an element, replacing supplied props and children without mutating the source element. */
export function cloneElement<P extends object>(
	element: ReactElement<P>,
	config?: Partial<P> & { key?: Key; ref?: unknown },
	...children: ReactNode[]
): ReactElement<P> {
	if (!isValidElement(element)) throw new TypeError('cloneElement requires a valid React element');
	const props = { ...element.props, ...(config ?? {}) } as Record<string, unknown> &
		P & { key?: Key; ref?: unknown; children?: ReactNode };
	const key = config && 'key' in config ? config.key : element.key;
	const ref = config && 'ref' in config ? config.ref : element.ref;
	delete props.key;
	delete props.ref;
	if (children.length === 1) props.children = children[0];
	else if (children.length > 1) props.children = children;
	return createElement(
		element.type,
		{ ...props, key: key ?? undefined, ref },
		...(children.length ? children : childrenFrom(props.children))
	) as ReactElement<P>;
}

/** Returns whether a value carries a supported React element marker. */
export function isValidElement(value: unknown): value is ReactElement {
	return isReactElement(value);
}

/** React-compatible utilities for traversing opaque children values. */
export const Children = {
	/** Transforms each input slot, normalizing empty slots to null, flattening returned arrays and preserving keyed scopes. Binds the callback to context when supplied. */
	map<T>(
		children: ReactNode,
		callback: (child: ReactNode, index: number) => T,
		context?: unknown
	): Array<T extends readonly unknown[] ? ReactNode : NonNullable<T>> | null {
		return mapReactChildren(children, callback, context) as Array<
			T extends readonly unknown[] ? ReactNode : NonNullable<T>
		> | null;
	},
	/** Visits each supplied slot in order without collecting results. Empty slots reach the callback as null, and context supplies its receiver. */
	forEach(
		children: ReactNode,
		callback: (child: ReactNode, index: number) => void,
		context?: unknown
	): void {
		visitReactChildren(children, callback, context);
	},
	/** Counts supplied slots, including empty array slots. An absent root has no slots. */
	count(children: ReactNode): number {
		return visitReactChildren(children);
	},
	only(children: ReactNode): ReactElement {
		if (!isValidElement(children))
			throw new Error('React.Children.only expected to receive a single React element child.');
		return children;
	},
	/** Flattens nonempty children and copies element records with scoped keys, retaining their props and leaving inputs unchanged. */
	toArray(children: ReactNode): ReactNode[] {
		return (mapReactChildren(children, (value) => value) ?? []) as ReactNode[];
	}
} as const;

function applyDefaultProps(type: unknown, props: Record<string, unknown>): void {
	if ((typeof type !== 'function' && typeof type !== 'object') || type === null) return;
	const defaults = (type as { defaultProps?: Record<string, unknown> }).defaultProps;
	if (!defaults) return;
	for (const [name, value] of Object.entries(defaults))
		if (props[name] === undefined) props[name] = value;
}

function childrenFrom(children: ReactNode | undefined): ReactNode[] {
	return children === undefined ? [] : Array.isArray(children) ? children : [children];
}
