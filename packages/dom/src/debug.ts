import { logFrameworkEvent } from '@exactjs/core';
import type { Root } from './types.js';

/** Emits a DOM patch trace event through the root logger. */
export function domDebug(
	root: Root,
	message: string,
	details?: Record<string, unknown> | (() => Record<string, unknown>)
): void {
	logFrameworkEvent('trace', 'dom', 'patch', message, details, root.logger);
}

/** Produces a compact human-readable description of a DOM node for logs. */
export function describeNode(node: Node | null | undefined): string {
	if (!node) return 'none';
	if (node instanceof Element) {
		const id = node.id ? `#${node.id}` : '';
		const className =
			typeof node.className === 'string' && node.className
				? `.${node.className.split(/\s+/).filter(Boolean).join('.')}`
				: '';
		return `${node.tagName.toLowerCase()}${id}${className}`;
	}
	return node.nodeName;
}
