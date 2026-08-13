import type { ExactRenderProgram } from '@exactjs/core';

const templateCaches = new WeakMap<Document, WeakMap<ExactRenderProgram, HTMLTemplateElement>>();

/** Returns the document-owned template cached for one immutable compiler render program. */
export function programTemplate(
	program: ExactRenderProgram,
	ownerDocument: Document
): HTMLTemplateElement {
	let cache = templateCaches.get(ownerDocument);
	if (!cache) templateCaches.set(ownerDocument, (cache = new WeakMap()));
	let template = cache.get(program);
	if (!template) {
		template = ownerDocument.createElement('template');
		if (program.namespace === 'html') template.innerHTML = program.template;
		else {
			const namespace =
				program.namespace === 'svg'
					? 'http://www.w3.org/2000/svg'
					: 'http://www.w3.org/1998/Math/MathML';
			const wrapper = ownerDocument.createElementNS(
				namespace,
				program.namespace === 'svg' ? 'svg' : 'math'
			);
			wrapper.innerHTML = program.template;
			template.content.append(...wrapper.childNodes);
		}
		cache.set(program, template);
	}
	return template;
}
