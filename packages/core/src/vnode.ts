import { computed, isReactiveValue, peek, unwrap, type ReactiveValue } from '@exactjs/reactive';
import type { Child, RenderResult, VNode, VNodeCell, VNodeType } from './component/contracts.js';
import { currentComponentDomain } from './component/domain.js';
import { encodeExactMarkerPart } from './protocol.js';
import {
	Cell,
	Dynamic,
	Fragment,
	Portal,
	ServerBoundary,
	ServerSlot,
	Text,
	Target,
	UnsafeHtml
} from './symbols.js';

/** Creates a normalized virtual node and extracts the special JSX key prop. */
export function createVNode(
	type: VNodeType,
	props: Record<string, unknown> | null,
	...children: unknown[]
): VNode {
	// Exclude the JSX-only key while copying so V8 can construct the normalized props object
	// directly instead of transitioning it through a property deletion.
	const { key: authoredKey, __exactEnhancements: enhancements, ...normalizedProps } = props ?? {};
	const rawKey = unwrap(authoredKey);
	const key = rawKey === null || rawKey === undefined ? undefined : String(rawKey);
	const domain = currentComponentDomain();

	return {
		type,
		props: normalizedProps,
		children: normalizeChildren(children),
		key,
		...(enhancements ? { enhancement: enhancements as VNode['enhancement'] } : {}),
		...(domain ? { domain } : {})
	};
}

/** Creates a virtual text node from an arbitrary value. */
export function createTextVNode(value: unknown): VNode {
	const domain = currentComponentDomain();
	return {
		type: Text,
		props: { value },
		children: [],
		...(domain ? { domain } : {})
	};
}

/** Wraps a vnode in a stable compiled cell used by generated reactive output. */
export function createCellVNode(vnode: VNode): VNode<{ cell: VNodeCell }> {
	const domain = vnode.domain ?? currentComponentDomain();
	return {
		type: Cell,
		props: {
			cell: {
				id: Symbol('exact.cell'),
				vnode
			}
		},
		children: [],
		key: vnode.key,
		...(domain ? { domain } : {})
	};
}

/** Creates a compiled vnode cell from raw vnode arguments. */
export function createCompiledVNode(
	type: VNodeType,
	props: Record<string, unknown> | null,
	...children: unknown[]
): VNode {
	return createCellVNode(createVNode(type, props, ...children));
}

/** Creates a compiled native component vnode without a redundant cell marker boundary. */
export function createCompiledComponentVNode(
	type: VNodeType,
	props: Record<string, unknown> | null,
	...children: unknown[]
): VNode {
	return createVNode(type, props, ...children);
}

/** Creates a compiled fragment vnode cell from raw children. */
export function createCompiledFragment(
	props: Record<string, unknown> | null,
	...children: unknown[]
): VNode {
	return createCompiledVNode(Fragment, props, ...children);
}

/** Creates a compiled semantic-target boundary from ordinary component output. */
export function createCompiledTarget(
	props: Record<string, unknown> | null,
	...children: unknown[]
): VNode {
	return createCompiledVNode(Target, props, ...children);
}

/** Creates a reactive expression wrapper for compiler-generated expression boundaries. */
export function createExpression<T>(compute: () => T) {
	return computed(compute);
}

/**
 * Reuses a compiler-proven reactive value forwarded through component props.
 * Non-reactive initial values retain computed semantics so later prop replacement stays observable.
 */
export function createForwardedExpression<T>(compute: () => T): T | ReactiveValue<T> {
	const value = peek(compute);
	return isReactiveValue(value) ? value : computed(compute);
}

/** Creates a dynamic child vnode whose render result is computed reactively. */
export function createDynamicChild(
	compute: () => RenderResult,
	markerId?: string,
	mayReplaceSubtree = true
): VNode {
	return createVNode(Dynamic, {
		value: computed(compute),
		...(mayReplaceSubtree ? {} : { __exactScalarDynamic: true }),
		...(markerId ? { __exactMarkerId: markerId } : {})
	});
}

/** Creates a logical child subtree whose nodes are placed in another renderer container. */
export function createPortal(target: unknown, ...children: unknown[]): VNode {
	return createVNode(Portal, { target }, ...children);
}

/** Creates a server boundary vnode that can be refreshed or replaced by server runtime responses. */
export function createServerBoundary(
	id: string,
	name: string,
	props: Record<string, unknown> = {},
	...children: unknown[]
): VNode {
	return createVNode(
		ServerBoundary,
		{
			id,
			name,
			props
		},
		...children
	);
}

/** Creates or adopts one compiler-owned server range. Children are emitted only by server artifacts. */
export function createServerSlot(
	id: string,
	authority: Record<string, unknown> = {},
	...children: unknown[]
): VNode {
	return createVNode(ServerSlot, { id, ...authority }, ...children);
}

/** Creates one canonical keyed server-range instance without exposing authored keys as protocol ids. */
export function createKeyedServerSlot(
	id: string,
	list: string,
	key: unknown,
	authority: Record<string, unknown> = {},
	...children: unknown[]
): VNode {
	const rawKey = unwrap(key);
	if (rawKey === null || rawKey === undefined)
		throw new Error('Keyed server ranges require a canonical key');
	const keyToken = String(rawKey);
	const runtimeId = `${id}:key:${encodeExactMarkerPart(keyToken)}`;
	return createVNode(
		ServerSlot,
		{
			id: runtimeId,
			...authority,
			key: keyToken,
			discriminator: { kind: 'keyed', list, keyToken }
		},
		...children
	);
}

/**
 * Creates an opaque raw-HTML range. Native render roots reject the range
 * unless the application explicitly opts in to unsafe HTML.
 */
export function unsafeHtml(value: unknown): VNode<{ value: unknown }> {
	return createVNode(UnsafeHtml, { value }) as VNode<{ value: unknown }>;
}

/**
 * Normalizes the direct children of an authored document root without mutating
 * the source vnode.
 */
export function normalizeDocumentVNode(vnode: VNode): VNode {
	if (typeof vnode.type !== 'string' || vnode.type.toLowerCase() !== 'html') {
		throw new TypeError('normalizeDocumentVNode() requires an <html> vnode');
	}
	const children = vnode.children.filter(
		(child) => child !== null && child !== undefined && child !== false && child !== true
	);
	const heads: VNode[] = [];
	const bodies: VNode[] = [];
	const loose: Child[] = [];

	for (const child of children) {
		if (isVNode(child) && typeof child.type === 'string') {
			const tag = child.type.toLowerCase();
			if (tag === 'html')
				throw new Error('A root document cannot contain a nested <html> element.');
			if (tag === 'head') {
				heads.push(child);
				continue;
			}
			if (tag === 'body') {
				bodies.push(child);
				continue;
			}
		}
		loose.push(child);
	}

	if (heads.length > 1)
		throw new Error('A root document may contain at most one direct <head> element.');
	if (bodies.length > 1)
		throw new Error('A root document may contain at most one direct <body> element.');
	if (bodies.length && loose.length) {
		throw new Error(
			'Root <html> children outside an authored <head> or <body> are ambiguous; move them into <body>.'
		);
	}

	const head = heads[0] ?? createVNode('head', null);
	const body = bodies[0] ?? createVNode('body', null, ...loose);
	const normalized: Child[] = [];
	let insertedHead = false;
	let insertedBody = false;
	for (const child of children) {
		if (isVNode(child) && child === heads[0]) {
			normalized.push(head);
			insertedHead = true;
		} else if (isVNode(child) && child === bodies[0]) {
			normalized.push(body);
			insertedBody = true;
		} else if (!bodies.length && loose.includes(child) && !insertedBody) {
			normalized.push(body);
			insertedBody = true;
		}
	}
	if (!insertedHead) normalized.unshift(head);
	if (!insertedBody) normalized.push(body);
	return { ...vnode, children: normalized };
}

/** Flattens nested JSX child arrays into the child shape consumed by renderers. */
export function normalizeChildren(children: unknown[]): Child[] {
	const normalized: Child[] = [];

	for (const child of children) {
		if (Array.isArray(child)) {
			normalized.push(...normalizeChildren(child));
		} else {
			normalized.push(child as Child);
		}
	}

	return normalized;
}

/** Returns whether a value has the minimal eXact vnode shape. */
export function isVNode(value: unknown): value is VNode {
	return (
		!!value &&
		typeof value === 'object' &&
		'type' in value &&
		'props' in value &&
		'children' in value
	);
}

/** Returns whether a vnode is a compiled cell wrapper. */
export function isCellVNode(value: unknown): value is VNode<{ cell: VNodeCell }> {
	return isVNode(value) && value.type === Cell;
}

/** Returns the inner vnode stored in a compiled cell wrapper. */
export function getCellVNode(vnode: VNode<{ cell: VNodeCell }>): VNode {
	return vnode.props.cell.vnode;
}
