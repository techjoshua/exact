import type { ExactDomRenderProgram } from '@exactjs/core/runtime/render-operations';
import { HTML_NAMESPACE, MATHML_NAMESPACE, SVG_NAMESPACE, namespaceForTag } from '../namespace.js';

type TemplateState = { uses: number; template?: HTMLTemplateElement };
type ConcreteNamespace = 'html' | 'svg' | 'mathml';

const templateCaches = new WeakMap<
	Document,
	WeakMap<ExactDomRenderProgram, Map<ConcreteNamespace, TemplateState>>
>();

/** Materializes one program fragment in its attachment namespace, caching only compatible DOM. */
export function materializeProgramTemplate(
	program: ExactDomRenderProgram,
	ownerDocument: Document,
	parentNode?: Node
): DocumentFragment {
	let cache = templateCaches.get(ownerDocument);
	if (!cache) templateCaches.set(ownerDocument, (cache = new WeakMap()));
	let namespaces = cache.get(program);
	if (!namespaces) cache.set(program, (namespaces = new Map()));
	const namespace = materializedNamespace(program, parentNode);
	let state = namespaces.get(namespace);
	if (!state) namespaces.set(namespace, (state = { uses: 0 }));
	state.uses++;
	if (state.template) return state.template.content.cloneNode(true) as DocumentFragment;
	const template = createProgramTemplate(program, ownerDocument, namespace);
	if (state.uses > 1) {
		state.template = template;
		return template.content.cloneNode(true) as DocumentFragment;
	}
	return template.content;
}

function createProgramTemplate(
	program: ExactDomRenderProgram,
	ownerDocument: Document,
	namespace: ConcreteNamespace
): HTMLTemplateElement {
	const template = ownerDocument.createElement('template');
	if (namespace === 'html') template.innerHTML = program.template;
	else {
		const namespaceUri = namespace === 'svg' ? SVG_NAMESPACE : MATHML_NAMESPACE;
		const wrapper = ownerDocument.createElementNS(
			namespaceUri,
			namespace === 'svg' ? 'svg' : 'math'
		);
		wrapper.innerHTML = program.template;
		while (wrapper.firstChild) template.content.append(wrapper.firstChild);
	}
	return template;
}

function materializedNamespace(
	program: ExactDomRenderProgram,
	parentNode?: Node
): ConcreteNamespace {
	if (program.namespace !== 'contextual') return program.namespace;
	if (!program.attachmentTag)
		throw new TypeError('Contextual eXact render program omitted its attachment tag');
	const parent = parentNode instanceof Element ? parentNode : undefined;
	const namespace = namespaceForTag(program.attachmentTag, parent) ?? HTML_NAMESPACE;
	return namespace === SVG_NAMESPACE ? 'svg' : namespace === MATHML_NAMESPACE ? 'mathml' : 'html';
}
