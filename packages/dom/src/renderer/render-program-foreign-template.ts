import { HTML_NAMESPACE, namespaceForTag } from '../namespace.js';

// HTML foreign-content parsing exits the authored namespace for these opening tags.
const breakoutOpening =
	/<(?:b|big|blockquote|body|br|center|code|dd|div|dl|dt|em|embed|font|h[1-6]|head|hr|i|img|li|listing|menu|meta|nobr|ol|p|pre|ruby|s|small|span|strong|strike|sub|sup|table|tt|u|ul|var)(?=[\s/>])/i;

/** Identifies templates whose foreign-content HTML parser can change namespace or topology. */
export function hasForeignTemplateBreakout(markup: string): boolean {
	return breakoutOpening.test(markup);
}

/** Checks cold parsed nodes against intrinsic namespaces before a template enters the clone cache. */
export function hasCompatibleForeignChildren(parent: Element): boolean {
	for (const child of Array.from(parent.children)) {
		const expected = namespaceForTag(child.localName, parent) ?? HTML_NAMESPACE;
		if (child.namespaceURI !== expected || !hasCompatibleForeignChildren(child)) return false;
	}
	return true;
}

// Compiler templates escape attribute/text markup and omit closing tags only for HTML void tags.
const voidOpening =
	/<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)(?=[\s/>])((?:"[^"]*"|'[^']*'|[^'">])*)>/g;

/**
 * Parses closed compiler markup without HTML foreign-content breakout or tree repair.
 * This cold construction path preserves tag case and static topology. Its caller caches clones.
 */
export function createForeignProgramFragment(
	markup: string,
	ownerDocument: Document,
	namespace: string
): DocumentFragment {
	const Parser = ownerDocument.defaultView?.DOMParser ?? DOMParser;
	const closed = markup.replace(
		voidOpening,
		(_opening, tag: string, attributes: string) => `<${tag}${attributes.replace(/\/$/, '')}/>`
	);
	const parsed = new Parser().parseFromString(
		`<exact-root xmlns="${namespace}" xmlns:xlink="http://www.w3.org/1999/xlink">${closed}</exact-root>`,
		'application/xml'
	);
	if (parsed.getElementsByTagName('parsererror').length)
		throw new TypeError('Invalid foreign-namespace eXact compiler template');
	const fragment = ownerDocument.createDocumentFragment();
	for (const node of Array.from(parsed.documentElement.childNodes))
		fragment.append(transferForeignNode(node, parsed.documentElement, ownerDocument));
	return fragment;
}

/** Transfers static nodes, rebuilding only namespace changes at intrinsic integration points. */
function transferForeignNode(node: Node, parent: Element, ownerDocument: Document): Node {
	if (node.nodeType !== 1) return node;
	const element = node as Element;
	const namespace = namespaceForTag(element.localName, parent) ?? HTML_NAMESPACE;
	let target = element;
	if (element.namespaceURI !== namespace) {
		target = ownerDocument.createElementNS(namespace, element.localName);
		for (const attribute of Array.from(element.attributes))
			target.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
	}
	for (const child of Array.from(element.childNodes)) {
		const transferred = transferForeignNode(child, target, ownerDocument);
		if (target !== element) target.append(transferred);
		else if (transferred !== child) target.replaceChild(transferred, child);
	}
	return target;
}
