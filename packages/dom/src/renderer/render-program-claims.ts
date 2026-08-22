import type {
	ExactRenderProgram,
	ExactRenderProgramBindingTarget
} from '@exactjs/core/runtime/render';

type ProgramClaimTarget = {
	readonly claiming: true;
	readonly root: Element;
	readonly source: 'template' | 'ssr';
	readonly elements: Array<Element | undefined>;
	readonly slotNodes: Array<Node | undefined>;
	readonly parents: Array<Node | null>;
	current: Node | null;
	valid: boolean;
	began: boolean;
};

/** Result of one compiler-wired successful-path claim. */
export type ClaimedRenderProgram = Readonly<{
	elements: readonly (Element | undefined)[];
	slotNodes: readonly (Node | undefined)[];
}>;

/** Runs the descriptor's generated claim lane without interpreting its node or slot tables. */
export function claimCompiledRenderProgram(
	program: ExactRenderProgram,
	root: Element,
	source: 'template' | 'ssr'
): ClaimedRenderProgram | undefined {
	if (!program.directClaims || !program.bind) return undefined;
	const target: ProgramClaimTarget = {
		claiming: true,
		root,
		source,
		elements: [],
		slotNodes: [],
		parents: [],
		current: null,
		valid: true,
		began: false
	};
	program.bind(target);
	if (target.valid && target.began && target.parents.length === 0)
		return { elements: target.elements, slotNodes: target.slotNodes };
	return undefined;
}

/** Selects the generated claim lane and validates its intrinsic root. */
export function beginCompiledProgramClaims(
	target: ExactRenderProgramBindingTarget,
	tag: string,
	namespace: ExactRenderProgram['namespace']
): boolean {
	if (!isClaimTarget(target)) return false;
	target.began = true;
	if (!matchesElement(target.root, tag, namespace)) {
		target.valid = false;
		return true;
	}
	target.elements[0] = target.root;
	target.current = target.root.firstChild;
	return true;
}

/** Claims one compiler-known intrinsic at the current parent cursor. */
export function claimCompiledProgramElement(
	target: ExactRenderProgramBindingTarget,
	index: number,
	skip: number,
	tag: string,
	namespace: ExactRenderProgram['namespace']
): void {
	if (!isClaimTarget(target) || !target.valid) return;
	const node = advance(target.current, skip);
	if (!(node instanceof Element) || !matchesElement(node, tag, namespace)) {
		target.valid = false;
		return;
	}
	target.elements[index] = node;
	target.current = node.nextSibling;
}

/** Enters the children of the last compiler-claimed intrinsic. */
export function enterCompiledProgramElement(
	target: ExactRenderProgramBindingTarget,
	index: number
): void {
	if (!isClaimTarget(target) || !target.valid) return;
	const element = target.elements[index];
	if (!element) {
		target.valid = false;
		return;
	}
	target.parents.push(target.current);
	target.current = element.firstChild;
}

/** Restores the parent cursor after a compiler-known intrinsic subtree. */
export function leaveCompiledProgramElement(target: ExactRenderProgramBindingTarget): void {
	if (!isClaimTarget(target) || !target.valid) return;
	const parent = target.parents.pop();
	if (parent === undefined) {
		target.valid = false;
		return;
	}
	target.current = parent;
}

/** Claims and removes one compiler-known scalar SSR sentinel pair. */
export function claimCompiledProgramText(
	target: ExactRenderProgramBindingTarget,
	index: number,
	skip: number,
	id: string
): void {
	if (!isClaimTarget(target) || !target.valid) return;
	const marker = advance(target.current, skip);
	const identity = markerIdentity(id);
	const expectedOpen = target.source === 'template' ? '' : `exact:dynamic:${identity}`;
	const expectedClose = target.source === 'template' ? '' : `/exact:dynamic:${identity}`;
	if (!(marker instanceof Comment) || marker.data !== expectedOpen) {
		target.valid = false;
		return;
	}
	const candidate = marker.nextSibling;
	let text: Text;
	let closing: Node | null;
	if (candidate instanceof Text) {
		text = candidate;
		closing = candidate.nextSibling;
	} else {
		text = marker.ownerDocument.createTextNode('');
		closing = candidate;
	}
	if (!(closing instanceof Comment) || closing.data !== expectedClose) {
		target.valid = false;
		return;
	}
	const next = closing.nextSibling;
	if (text.parentNode === null) closing.parentNode?.insertBefore(text, closing);
	target.slotNodes[index] = text;
	marker.remove();
	closing.remove();
	target.current = next;
}

/** Claims one variable-width structural range and advances past its matching boundary. */
export function claimCompiledProgramChild(
	target: ExactRenderProgramBindingTarget,
	index: number,
	skip: number,
	id: string
): void {
	if (!isClaimTarget(target) || !target.valid) return;
	const marker = advance(target.current, skip);
	const identity = markerIdentity(id);
	if (!(marker instanceof Comment) || marker.data !== `exact:dynamic:${identity}`) {
		target.valid = false;
		return;
	}
	const closingIdentity = `/exact:dynamic:${identity}`;
	let closing = marker.nextSibling;
	while (closing && (!(closing instanceof Comment) || closing.data !== closingIdentity))
		closing = closing.nextSibling;
	if (!closing) {
		target.valid = false;
		return;
	}
	target.slotNodes[index] = marker;
	target.current = closing.nextSibling;
}

function isClaimTarget(target: ExactRenderProgramBindingTarget): target is ProgramClaimTarget {
	return (target as Partial<ProgramClaimTarget>).claiming === true;
}

function advance(node: Node | null, count: number): Node | null {
	for (let index = 0; node && index < count; index++) node = node.nextSibling;
	return node;
}

function matchesElement(
	element: Element,
	tag: string,
	namespace: ExactRenderProgram['namespace']
): boolean {
	const uri =
		namespace === 'svg'
			? 'http://www.w3.org/2000/svg'
			: namespace === 'mathml'
				? 'http://www.w3.org/1998/Math/MathML'
				: 'http://www.w3.org/1999/xhtml';
	return element.localName.toLowerCase() === tag.toLowerCase() && element.namespaceURI === uri;
}

function markerIdentity(id: string): string {
	return id.startsWith('exact:') ? id.slice('exact:'.length) : id;
}
