import type { ReactElement, ReactNode, ReactPortal } from '@exactjs/react-compat';
import {
	isReactElement,
	iterateReactChildEntries,
	reactChildEntryKey,
	isReactPortal,
	reactElementCompatibilityContribution,
	REACT_ACTIVITY_TYPE,
	REACT_FRAGMENT_TYPE,
	REACT_STRICT_MODE_TYPE
} from '@exactjs/react-compat/exact';
import type { ReactMounted } from './types.js';

/** React child shape accepted by the compatibility renderer after flattening. */
export type NormalizedReactNode = ReactElement | ReactPortal | string;

/** Flattens React children while preserving elements, portals, and scalar text. */
export function normalizeReactChildren(
	value: ReactNode
): Array<{ node: NormalizedReactNode; key: string }> {
	const result: Array<{ node: NormalizedReactNode; key: string }> = [];
	for (const entry of iterateReactChildEntries(value)) {
		const { node } = entry;
		if (node === null || node === undefined || typeof node === 'boolean') continue;
		if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
			if (node !== '')
				result.push({ node: String(node), key: reactChildEntryKey(entry, undefined) });
			continue;
		}
		if (isReactElement(node) || isReactPortal(node)) {
			result.push({ node, key: reactChildEntryKey(entry, node.key) });
			continue;
		}
		if (node instanceof Promise) throw node;
		throw new TypeError(
			`Objects are not valid as a React child (${Object.prototype.toString.call(node)})`
		);
	}
	return result;
}

/** Reports whether an existing React-owned range can receive the next child in place. */
export function canPatchReactNode(mounted: ReactMounted, node: NormalizedReactNode): boolean {
	if (typeof node === 'string') return mounted.kind === 'text';
	if (isReactPortal(node))
		return mounted.kind === 'portal' && mounted.portalTarget === node.containerInfo;
	if (!isReactElement(node)) return false;
	if (reactElementCompatibilityContribution(node)) return mounted.kind === 'native';
	if (typeof node.type === 'string') return mounted.kind === 'host' && mounted.type === node.type;
	if (
		node.type === REACT_FRAGMENT_TYPE ||
		node.type === REACT_STRICT_MODE_TYPE ||
		node.type === REACT_ACTIVITY_TYPE
	)
		return mounted.kind === 'fragment' && mounted.type === node.type;
	return mounted.kind === 'component' && mounted.type === node.type;
}

/** Copies the public element props and restores React 19's element-level ref when necessary. */
export function reactElementProps(element: ReactElement): Record<string, unknown> {
	const props = { ...(element.props as Record<string, unknown>) };
	if (element.ref !== null && element.ref !== undefined && !('ref' in props))
		props.ref = element.ref;
	return props;
}

/** Reads an explicitly authored React raw-HTML payload. */
export function dangerousHtml(props: Record<string, unknown>): string | undefined {
	const value = props.dangerouslySetInnerHTML;
	return typeof value === 'object' && value !== null && '__html' in value
		? String((value as { __html: unknown }).__html ?? '')
		: undefined;
}

/** Selects the DOM namespace inherited by one React host element. */
export function hostNamespace(parent: Node, tag: string): string | undefined {
	if (tag === 'svg') return 'http://www.w3.org/2000/svg';
	if (tag === 'math') return 'http://www.w3.org/1998/Math/MathML';
	return parent instanceof Element && parent.namespaceURI !== 'http://www.w3.org/1999/xhtml'
		? (parent.namespaceURI ?? undefined)
		: undefined;
}
