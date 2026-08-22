import type { ExactRenderProgram } from '@exactjs/core/runtime/render';

type TemplateState = { uses: number; template?: HTMLTemplateElement };

const templateCaches = new WeakMap<Document, WeakMap<ExactRenderProgram, TemplateState>>();

/** Materializes one program fragment, caching inert DOM only after demonstrated reuse. */
export function materializeProgramTemplate(
	program: ExactRenderProgram,
	ownerDocument: Document
): DocumentFragment {
	let cache = templateCaches.get(ownerDocument);
	if (!cache) templateCaches.set(ownerDocument, (cache = new WeakMap()));
	let state = cache.get(program);
	if (!state) cache.set(program, (state = { uses: 0 }));
	state.uses++;
	if (state.template) return state.template.content.cloneNode(true) as DocumentFragment;
	const template = createProgramTemplate(program, ownerDocument);
	if (state.uses > 1) {
		state.template = template;
		return template.content.cloneNode(true) as DocumentFragment;
	}
	return template.content;
}

function createProgramTemplate(
	program: ExactRenderProgram,
	ownerDocument: Document
): HTMLTemplateElement {
	const template = ownerDocument.createElement('template');
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
		while (wrapper.firstChild) template.content.append(wrapper.firstChild);
	}
	return template;
}
