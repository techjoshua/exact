import { voidElements } from '../html.js';
import {
	MAX_DIFF_HTML_BYTES,
	MAX_DIFF_HTML_DEPTH,
	MAX_DIFF_HTML_NODES,
	type ParsedHtmlElement,
	type ParsedHtmlNode
} from './elements.js';
import {
	decodeEscapedText,
	parseSimpleAttributes,
	stringAttribute,
	textOnlyContent
} from './patches.js';

export function parseHtmlNodes(html: string): ParsedHtmlNode[] | undefined {
	if (new TextEncoder().encode(html).byteLength > MAX_DIFF_HTML_BYTES) return undefined;
	const root: ParsedHtmlElement = {
		kind: 'element',
		tagName: '',
		attributes: new Map(),
		children: []
	};
	const stack: ParsedHtmlElement[] = [root];
	const exactIds = new Set<string>();
	let nodeCount = 0;
	const tokenPattern = /<!--[\s\S]*?-->|<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*)?>|[^<]+/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = tokenPattern.exec(html))) {
		if (match.index !== lastIndex) return undefined;
		const token = match[0];
		lastIndex = tokenPattern.lastIndex;
		if (token.startsWith('<!--')) continue;

		const parent = stack[stack.length - 1]!;
		if (token.startsWith('</')) {
			const tagName = token.slice(2, -1).trim();
			const current = stack.pop();
			if (!current || current === root || current.tagName !== tagName) return undefined;
			continue;
		}

		if (token.startsWith('<')) {
			const start = /^<([A-Za-z][A-Za-z0-9:-]*)([^<>]*?)(\/?)>$/.exec(token);
			if (!start) return undefined;
			const tagName = start[1]!;
			const attributes = parseSimpleAttributes(start[2] ?? '');
			if (!attributes) return undefined;
			const element: ParsedHtmlElement = { kind: 'element', tagName, attributes, children: [] };
			if (++nodeCount > MAX_DIFF_HTML_NODES) return undefined;
			const exactId = stringAttribute(element, 'data-exact-id');
			if (exactId && exactIds.has(exactId)) return undefined;
			if (exactId) exactIds.add(exactId);
			parent.children.push(element);
			if (!start[3] && !voidElements.has(tagName.toLowerCase())) {
				if (stack.length >= MAX_DIFF_HTML_DEPTH) return undefined;
				stack.push(element);
			}
			continue;
		}

		if (++nodeCount > MAX_DIFF_HTML_NODES) return undefined;
		parent.children.push({ kind: 'text', value: decodeEscapedText(token) });
	}

	if (lastIndex !== html.length || stack.length !== 1) return undefined;
	return root.children;
}

export function collectExactElements(
	nodes: readonly ParsedHtmlNode[],
	output = new Map<string, ParsedHtmlElement>()
): Map<string, ParsedHtmlElement> {
	const pending = [...nodes].reverse();
	while (pending.length) {
		const node = pending.pop()!;
		if (node.kind !== 'element') continue;
		const id = stringAttribute(node, 'data-exact-id');
		if (id) output.set(id, node);
		for (let index = node.children.length - 1; index >= 0; index--)
			pending.push(node.children[index]!);
	}
	return output;
}

export function collectExactElementEntries(
	nodes: readonly ParsedHtmlNode[],
	output: ExactElementEntry[] = [],
	depth = 0
): ExactElementEntry[] {
	const pending = Array.from(nodes, (node) => ({
		node,
		depth,
		exactParent: undefined as ExactAncestor | undefined
	})).reverse();
	while (pending.length) {
		const current = pending.pop()!;
		const node = current.node;
		if (node.kind !== 'element') continue;
		const id = stringAttribute(node, 'data-exact-id');
		if (id)
			output.push({ id, element: node, depth: current.depth, exactParent: current.exactParent });
		const childParent = id ? { id, parent: current.exactParent } : current.exactParent;
		for (let index = node.children.length - 1; index >= 0; index--) {
			pending.push({
				node: node.children[index]!,
				depth: current.depth + 1,
				exactParent: childParent
			});
		}
	}
	return output;
}

export type ExactAncestor = { readonly id: string; readonly parent?: ExactAncestor };

export type ExactElementEntry = {
	readonly id: string;
	readonly element: ParsedHtmlElement;
	readonly depth: number;
	readonly exactParent?: ExactAncestor;
};

export function collectNormalizedShapeIds(
	nodes: readonly ParsedHtmlNode[],
	interner: Map<string, number>
): WeakMap<ParsedHtmlNode, number> {
	const ids = new WeakMap<ParsedHtmlNode, number>();
	const pending: Array<{ node: ParsedHtmlNode; visited: boolean }> = Array.from(nodes, (node) => ({
		node,
		visited: false
	})).reverse();
	while (pending.length) {
		const current = pending.pop()!;
		if (!current.visited && current.node.kind === 'element') {
			pending.push({ node: current.node, visited: true });
			for (let index = current.node.children.length - 1; index >= 0; index--) {
				pending.push({ node: current.node.children[index]!, visited: false });
			}
			continue;
		}
		const signature =
			current.node.kind === 'text'
				? JSON.stringify(['text', current.node.value])
				: normalizedElementSignature(current.node, ids);
		let id = interner.get(signature);
		if (id === undefined) {
			id = interner.size + 1;
			interner.set(signature, id);
		}
		ids.set(current.node, id);
	}
	return ids;
}

export function normalizedElementSignature(
	element: ParsedHtmlElement,
	ids: WeakMap<ParsedHtmlNode, number>
): string {
	const exactId = stringAttribute(element, 'data-exact-id');
	const attributes: unknown = exactId
		? ['exact', exactId]
		: Array.from(element.attributes).sort(([left], [right]) => left.localeCompare(right));
	const children: unknown =
		exactId && textOnlyContent(element) !== undefined
			? ['text']
			: element.children.map((child) => ids.get(child));
	return JSON.stringify(['element', element.tagName, attributes, children]);
}
