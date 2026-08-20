/**
 * Enforces that hydration runs against the executing realm's current document.
 * eXact's DOM renderer, event delegation, focus ownership, and lifecycle use
 * that realm's platform constructors and therefore cannot own a foreign window.
 */
export function assertCurrentDocumentContainer(container: Element | Document): void {
	const currentDocument = globalThis.document;
	const containerDocument =
		container.nodeType === 9 ? (container as Document) : (container as Element).ownerDocument;
	if (containerDocument !== currentDocument) {
		throw new Error('eXact hydration requires a container owned by the current document.');
	}
	const elementConstructor = currentDocument.defaultView?.Element;
	if (
		container.nodeType !== 9 &&
		elementConstructor &&
		!(container instanceof elementConstructor)
	) {
		throw new Error('eXact hydration requires a container created in the current window realm.');
	}
}
