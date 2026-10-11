import type { ExactDomRenderProgram } from '@exactjs/core/runtime/render-operations';
import { HTML_NAMESPACE, MATHML_NAMESPACE, SVG_NAMESPACE, namespaceForTag } from '../namespace.js';

import {
	createForeignProgramFragment,
	caseSensitiveTemplateAttributes,
	hasCompatibleForeignChildren,
	hasForeignTemplateBreakout
} from './render-program-foreign-template.js';

type TemplateState = {
	uses: number;
	template?: HTMLTemplateElement;
	rootProps?: Readonly<Record<string, unknown>>;
};
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
	const { state, namespace } = programTemplateState(program, ownerDocument, parentNode);
	state.uses++;
	if (state.template) return state.template.content.cloneNode(true) as DocumentFragment;
	const template = createProgramTemplate(program, ownerDocument, namespace);
	if (state.uses > 1) {
		state.template = template;
		return template.content.cloneNode(true) as DocumentFragment;
	}
	return template.content;
}

/** Reads immutable authored root props from the cached compiler template in its attachment namespace. */
export function readProgramTemplateRootProps(
	program: ExactDomRenderProgram,
	ownerDocument: Document,
	parentNode?: Node
): Readonly<Record<string, unknown>> {
	const { state, namespace } = programTemplateState(program, ownerDocument, parentNode);
	if (state.rootProps) return state.rootProps;
	state.template ??= createProgramTemplate(program, ownerDocument, namespace);
	const root = state.template.content.firstElementChild;
	if (!root) throw new TypeError('A semantic intrinsic must retain its compiler template');
	const props: Record<string, unknown> = {};
	for (const attribute of root.attributes) {
		const name =
			attribute.name === 'class'
				? 'className'
				: attribute.name === 'for'
					? 'htmlFor'
					: attribute.name;
		props[name] = attribute.value;
	}
	return (state.rootProps = Object.freeze(props));
}

/** Owns document and namespace separation for cached static DOM and authored props. */
function programTemplateState(
	program: ExactDomRenderProgram,
	ownerDocument: Document,
	parentNode?: Node
): { state: TemplateState; namespace: ConcreteNamespace } {
	let cache = templateCaches.get(ownerDocument);
	if (!cache) templateCaches.set(ownerDocument, (cache = new WeakMap()));
	let namespaces = cache.get(program);
	if (!namespaces) cache.set(program, (namespaces = new Map()));
	const namespace = materializedNamespace(program, parentNode);
	let state = namespaces.get(namespace);
	if (!state) namespaces.set(namespace, (state = { uses: 0 }));
	return { state, namespace };
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
		const attributeNames = caseSensitiveTemplateAttributes(program.template);
		if (
			(attributeNames || hasForeignTemplateBreakout(program.template)) &&
			!hasCompatibleForeignChildren(wrapper, attributeNames)
		) {
			template.content.append(
				createForeignProgramFragment(program.template, ownerDocument, namespaceUri)
			);
		} else {
			while (wrapper.firstChild) template.content.append(wrapper.firstChild);
		}
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
