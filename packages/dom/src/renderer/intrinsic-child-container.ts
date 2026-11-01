import { HTML_NAMESPACE } from '../namespace.js';

/**
 * Selects the native container for authored intrinsic children without changing host ownership.
 * HTML templates keep children in their inert content fragment. Namespace and native capability
 * checks also work for nodes from another document or realm, without a global constructor test.
 */
export function intrinsicChildContainer(node: Node): Node {
	if (node.nodeType !== 1) return node;
	const element = node as Element;
	return element.namespaceURI === HTML_NAMESPACE && element.localName === 'template'
		? ((element as HTMLTemplateElement).content ?? node)
		: node;
}
