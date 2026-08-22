import type {
	ExactRenderProgram,
	ExactRenderProgramBindingTarget
} from '@exactjs/core/runtime/render';

type ProgramClaimTarget = {
	readonly claiming: true;
	readonly root: Element;
	readonly source: 'template' | 'ssr';
	namespace: ExactRenderProgram['namespace'];
	readonly elements: Array<Element | undefined>;
	readonly slotNodes: Array<Node | undefined>;
	componentSlots: number | Set<number>;
	work: readonly [nodes: number, slots: number];
	readonly parents: Array<Node | null>;
	readonly containers: Node[];
	container: Node;
	current: Node | null;
	valid: boolean;
	began: boolean;
};

/** Result of one compiler-wired successful-path claim. */
export type ClaimedRenderProgram = Readonly<{
	elements: readonly (Element | undefined)[];
	slotNodes: readonly (Node | undefined)[];
	componentSlots: number | ReadonlySet<number>;
	work: readonly [nodes: number, slots: number];
}>;

/** Runs the descriptor's generated claim lane without interpreting its node or slot tables. */
export function claimCompiledRenderProgram(
	program: ExactRenderProgram,
	root: Element,
	source: 'template' | 'ssr'
): ClaimedRenderProgram | undefined {
	if (!program.directClaims) return undefined;
	if (!program.bind) {
		if (!matchesElement(root, program.root[0], program.root[1] ?? program.namespace))
			return undefined;
		return { elements: [root], slotNodes: [], componentSlots: 0, work: program.work };
	}
	const target: ProgramClaimTarget = {
		claiming: true,
		root,
		source,
		namespace: program.namespace,
		elements: [],
		slotNodes: [],
		componentSlots: 0,
		work: [0, 0],
		parents: [],
		containers: [],
		container: root,
		current: null,
		valid: true,
		began: false
	};
	program.bind(target);
	if (target.valid && target.began && target.parents.length === 0)
		return {
			elements: target.elements,
			slotNodes: target.slotNodes,
			componentSlots: target.componentSlots,
			work: target.work
		};
	return undefined;
}

/** Copies one claimed element into the slot lane consumed by a compiled property group. */
export function claimCompiledProgramProperty(
	target: ExactRenderProgramBindingTarget,
	slot: number,
	element: number
): void {
	if (!isClaimTarget(target) || !target.valid) return;
	const claimed = target.elements[element];
	if (!claimed) {
		target.valid = false;
		return;
	}
	target.slotNodes[slot] = claimed;
}

/** Selects the generated claim lane and validates its intrinsic root. */
export function beginCompiledProgramClaims(
	target: ExactRenderProgramBindingTarget,
	tag: string,
	namespace: ExactRenderProgram['namespace'],
	nodes: number,
	slots: number
): boolean {
	if (!isClaimTarget(target)) return false;
	target.began = true;
	target.namespace = namespace;
	target.work = [nodes, slots];
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
	namespace?: ExactRenderProgram['namespace']
): void {
	if (!isClaimTarget(target) || !target.valid) return;
	const node = advance(target.current, skip);
	if (!(node instanceof Element) || !matchesElement(node, tag, namespace ?? target.namespace)) {
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
	target.containers.push(target.container);
	target.container = element;
	target.current = element.firstChild;
}

/** Restores the parent cursor after a compiler-known intrinsic subtree. */
export function leaveCompiledProgramElement(target: ExactRenderProgramBindingTarget): void {
	if (!isClaimTarget(target) || !target.valid) return;
	const parent = target.parents.pop();
	const container = target.containers.pop();
	if (parent === undefined || !container) {
		target.valid = false;
		return;
	}
	target.container = container;
	target.current = parent;
}

/** Claims and removes one compiler-known scalar SSR sentinel pair. */
export function claimCompiledProgramText(
	target: ExactRenderProgramBindingTarget,
	index: number,
	skip: number,
	id: string,
	markerlessSsr = false
): void {
	if (!isClaimTarget(target) || !target.valid) return;
	if (target.source === 'ssr' && markerlessSsr) {
		let marker = target.current;
		for (let offset = 0; offset < skip; offset++) {
			if (!marker) {
				target.valid = false;
				return;
			}
			marker = marker.nextSibling;
		}
		if (marker instanceof Comment && marker.data.startsWith('exact:')) {
			target.valid = false;
			return;
		}
		const text =
			marker instanceof Text
				? marker
				: (marker?.ownerDocument ?? target.root.ownerDocument).createTextNode('');
		if (!(marker instanceof Text)) target.container.insertBefore(text, marker);
		target.slotNodes[index] = text;
		target.current = marker instanceof Text ? marker.nextSibling : marker;
		return;
	}
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
	id: string,
	component = false
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
	if (component) markComponentSlot(target, index);
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

function markComponentSlot(target: ProgramClaimTarget, index: number): void {
	if (index < 31 && typeof target.componentSlots === 'number') {
		target.componentSlots |= 1 << index;
		return;
	}
	if (typeof target.componentSlots === 'number') {
		const slots = new Set<number>();
		for (let bit = 0; bit < 31; bit++) {
			if ((target.componentSlots & (1 << bit)) !== 0) slots.add(bit);
		}
		target.componentSlots = slots;
	}
	target.componentSlots.add(index);
}
