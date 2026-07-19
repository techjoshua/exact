import { computed, unwrap } from '@exact/reactive';
import type { Child, RenderResult, VNode, VNodeCell, VNodeType } from './index.js';
import {
	Cell,
	Dynamic,
	Fragment,
	Portal,
	ServerBoundary,
	ServerSlot,
	Text,
	UnsafeHtml
} from './symbols.js';

/** Creates a normalized virtual node and extracts the special JSX key prop. */
export function createVNode(
	type: VNodeType,
	props: Record<string, unknown> | null,
	...children: unknown[]
): VNode {
	const normalizedProps = { ...(props ?? {}) };
	const rawKey = unwrap(normalizedProps.key);
	const key = rawKey === null || rawKey === undefined ? undefined : String(rawKey);
	delete normalizedProps.key;

	return {
		type,
		props: normalizedProps,
		children: normalizeChildren(children),
		key
	};
}

/** Creates a virtual text node from an arbitrary value. */
export function createTextVNode(value: unknown): VNode {
	return {
		type: Text,
		props: { value },
		children: []
	};
}

/** Wraps a vnode in a stable compiled cell used by generated reactive output. */
export function createCellVNode(vnode: VNode): VNode<{ cell: VNodeCell }> {
	return {
		type: Cell,
		props: {
			cell: {
				id: Symbol('exact.cell'),
				vnode
			}
		},
		children: [],
		key: vnode.key
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

/** Creates a compiled fragment vnode cell from raw children. */
export function createCompiledFragment(
	props: Record<string, unknown> | null,
	...children: unknown[]
): VNode {
	return createCompiledVNode(Fragment, props, ...children);
}

/** Creates a reactive expression wrapper for compiler-generated expression boundaries. */
export function createExpression<T>(compute: () => T) {
	return computed(compute);
}

/** Creates a dynamic child vnode whose render result is computed reactively. */
export function createDynamicChild(compute: () => RenderResult): VNode {
	return createVNode(Dynamic, { value: computed(compute) });
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

/** Creates a placeholder vnode for server-rendered children passed through a client island. */
export function createServerSlot(id: string): VNode {
	return createVNode(ServerSlot, { id });
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
