import type { ExpressionNode } from '../model.js';

const sourceTextByNode = new WeakMap<ExpressionNode, string>();

function sourceNodeText(this: ExpressionNode): string | undefined {
	const source = sourceTextByNode.get(this);
	const span = this.span;
	return source !== undefined && span ? source.slice(span.start, span.end) : undefined;
}

/** Freezes a projected node while retaining lazy access to its original source text. */
export function freezeSourceNode<T extends ExpressionNode>(node: T, source: string): T {
	sourceTextByNode.set(node, source);
	Object.defineProperty(node, 'text', {
		configurable: false,
		enumerable: true,
		get: sourceNodeText
	});
	return Object.freeze(node);
}
