import { HTML_NAMESPACE, namespaceForTag } from '../namespace.js';

// HTML foreign-content parsing exits the authored namespace for these opening tags.
const breakoutOpening =
	/<(?:b|big|blockquote|body|br|center|code|dd|div|dl|dt|em|embed|font|h[1-6]|head|hr|i|img|li|listing|menu|meta|nobr|ol|p|pre|ruby|s|small|span|strong|strike|sub|sup|table|tt|u|ul|var)(?=[\s/>])/i;

/** Identifies templates whose foreign-content HTML parser can change namespace or topology. */
export function hasForeignTemplateBreakout(markup: string): boolean {
	return breakoutOpening.test(markup);
}

/** Retains source spellings that case-sensitive foreign attribute readers distinguish. */
export function caseSensitiveTemplateAttributes(
	markup: string
): ReadonlyMap<string, string> | undefined {
	let names: Map<string, string> | undefined;
	for (const opening of markup.matchAll(compilerOpening)) {
		for (const attribute of opening[2]!.matchAll(/"[^"]*"|'[^']*'|([A-Za-z_:][\w.:-]*)\s*=/g)) {
			const name = attribute[1];
			if (name && name !== name.toLowerCase()) {
				(names ??= new Map()).set(name.toLowerCase(), name);
			}
		}
	}
	return names;
}

/** Checks cold parsed namespaces and attribute spelling before a template enters the clone cache. */
export function hasCompatibleForeignChildren(
	parent: Element,
	attributeNames?: ReadonlyMap<string, string>
): boolean {
	for (const child of Array.from(parent.children)) {
		const expected = namespaceForTag(child.localName, parent) ?? HTML_NAMESPACE;
		if (child.namespaceURI !== expected) return false;
		if (child.namespaceURI !== HTML_NAMESPACE && attributeNames) {
			for (const attribute of Array.from(child.attributes)) {
				const original = attributeNames.get(attribute.name);
				if (original && original !== attribute.name) return false;
			}
		}
		if (!hasCompatibleForeignChildren(child, attributeNames)) return false;
	}
	return true;
}

// Compiler templates escape text/attributes, emit bare required, and omit HTML void closings.
const compilerOpening = /<([A-Za-z][\w.:-]*)(?=[\s/>])((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
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
	const normalized = markup.replace(
		compilerOpening,
		(_opening, tag: string, attributes: string) => {
			// Character references preserve literal attribute whitespace through XML parsing.
			const props = attributes.replace(
				/"[^"]*"|'[^']*'|(\srequired)(?=\s|\/|$)/g,
				(token, bare: string | undefined) =>
					bare ? `${bare}=""` : token.replace(/[\t\n\r]/g, (space) => `&#${space.charCodeAt(0)};`)
			);
			return `<${tag}${props}>`;
		}
	);
	const closed = normalized.replace(
		voidOpening,
		(_opening, tag: string, attributes: string) => `<${tag}${attributes.replace(/\/$/, '')}/>`
	);
	const parsed = new Parser().parseFromString(
		`<exact-root xmlns="${namespace}" xmlns:xlink="http://www.w3.org/1999/xlink">${closed}</exact-root>`,
		'application/xml'
	);
	if (
		parsed.getElementsByTagNameNS(
			'http://www.mozilla.org/newlayout/xml/parsererror.xml',
			'parsererror'
		).length
	)
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
		// Native HTML setters apply the case folding required by reflected properties.
		for (const attribute of Array.from(element.attributes)) {
			if (attribute.namespaceURI)
				target.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
			else target.setAttribute(attribute.name, attribute.value);
		}
	}
	for (const child of Array.from(element.childNodes)) {
		const transferred = transferForeignNode(child, target, ownerDocument);
		if (target !== element) target.append(transferred);
		else if (transferred !== child) target.replaceChild(transferred, child);
	}
	return target;
}
