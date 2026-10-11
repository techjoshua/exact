import { peek, unwrap } from '@exactjs/reactive/framework/runtime';

const annotationEncodings = new WeakMap<Element, unknown>();

/** Provides the canonical html namespace value. */
export const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
/** Provides the canonical svg namespace value. */
export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
/** Provides the canonical mathml namespace value. */
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
		const current = annotationEncodings.has(parent)
			? peek(() => unwrap(annotationEncodings.get(parent)))
			: parent.getAttribute('encoding');
		const encoding = typeof current === 'string' ? current.toLowerCase() : undefined;
		if (encoding === 'text/html' || encoding === 'application/xhtml+xml') return undefined;
	}
	return MATHML_NAMESPACE;
}

/** Retains only the namespace-defining input for an owned MathML annotation element. */
export function retainNamespaceEncoding(element: Element, value: unknown): void {
	if (element.namespaceURI === MATHML_NAMESPACE && element.localName === 'annotation-xml')
		annotationEncodings.set(element, value);
}

/** Updates namespace construction inputs before mounting, adopting or replacing child ranges. */
export function retainNamespaceProps(
	element: Element,
	props: Readonly<Record<string, unknown>>
): void {
	if (element.namespaceURI !== MATHML_NAMESPACE || element.localName !== 'annotation-xml') return;
	if ('encoding' in props || annotationEncodings.has(element))
		annotationEncodings.set(element, props.encoding);
}

/** Releases namespace inputs alongside the owning element's property bindings. */
export function clearNamespaceEncoding(element: Element): void {
	if (element.localName === 'annotation-xml') annotationEncodings.delete(element);
}
