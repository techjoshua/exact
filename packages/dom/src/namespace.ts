export const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
export const MATHML_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';

/** Resolves the namespace for an intrinsic child, including HTML integration points. */
export function namespaceForTag(tag: string, parent?: Element): string | undefined {
	if (tag === 'svg') return SVG_NAMESPACE;
	if (tag === 'math') return MATHML_NAMESPACE;
	if (!parent) return undefined;
	const inherited = parent.namespaceURI;
	if (inherited === SVG_NAMESPACE)
		return parent.localName === 'foreignObject' ? undefined : SVG_NAMESPACE;
	if (inherited !== MATHML_NAMESPACE) return undefined;
	if (
		['mi', 'mo', 'mn', 'ms', 'mtext'].includes(parent.localName) &&
		tag !== 'mglyph' &&
		tag !== 'malignmark'
	)
		return undefined;
	if (parent.localName === 'annotation-xml') {
		const encoding = parent.getAttribute('encoding')?.toLowerCase();
		if (encoding === 'text/html' || encoding === 'application/xhtml+xml') return undefined;
	}
	return MATHML_NAMESPACE;
}
