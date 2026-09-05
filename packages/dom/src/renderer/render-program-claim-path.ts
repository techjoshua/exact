import type {
	ExactRenderProgram,
	ExactRenderProgramBindingTarget
} from '@exactjs/core/runtime/render-operations';
import { HTML_NAMESPACE, MATHML_NAMESPACE, SVG_NAMESPACE, namespaceForTag } from '../namespace.js';

type PathClaimTarget = {
	readonly claiming: true;
	readonly root: Element;
	readonly elements: Array<Element | undefined>;
	readonly namespace: ExactRenderProgram['namespace'];
	valid: boolean;
};

/** Claims one required intrinsic through its compiler-encoded element-child path. */
export function claimCompiledProgramElementPath(
	target: ExactRenderProgramBindingTarget,
	index: number,
	path: number,
	tag: string,
	namespace?: ExactRenderProgram['namespace']
): void {
	const claim = target as Partial<PathClaimTarget>;
	if (claim.claiming !== true || !claim.valid || !claim.root || !claim.elements) return;
	let remaining = Math.floor(path);
	let depth = remaining % 16;
	remaining = Math.floor(remaining / 16);
	let element = claim.root;
	while (depth-- > 0) {
		const step = remaining % 128;
		const ordinal = step % 64;
		const child = element.children.item(
			step < 64 ? ordinal : element.children.length - ordinal - 1
		);
		if (!child) {
			claim.valid = false;
			return;
		}
		element = child;
		remaining = Math.floor(remaining / 128);
	}
	if (!matchesProgramElement(element, tag, namespace ?? claim.namespace!)) {
		claim.valid = false;
		return;
	}
	claim.elements[index] = element;
}

/** Tests a claimed intrinsic against its compiler-selected namespace. */
export function matchesProgramElement(
	element: Element,
	tag: string,
	namespace: ExactRenderProgram['namespace']
): boolean {
	const uri =
		namespace === 'contextual'
			? element.parentElement
				? (namespaceForTag(tag, element.parentElement) ?? HTML_NAMESPACE)
				: element.namespaceURI
			: namespace === 'svg'
				? SVG_NAMESPACE
				: namespace === 'mathml'
					? MATHML_NAMESPACE
					: HTML_NAMESPACE;
	return element.localName.toLowerCase() === tag.toLowerCase() && element.namespaceURI === uri;
}
