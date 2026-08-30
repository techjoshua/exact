import type {
	ExactRenderProgram,
	ExactRenderProgramBindingTarget,
	ExactRenderProgramWiring
} from '@exactjs/core/runtime/render-operations';
import type { RenderProgramChildAnchor } from '../types.js';
import { HTML_NAMESPACE, MATHML_NAMESPACE, SVG_NAMESPACE, namespaceForTag } from '../namespace.js';

type ConcreteNamespace = 'html' | 'svg' | 'mathml';

type ProgramClaimTarget = {
	readonly claiming: true;
	readonly root: Element;
	readonly source: 'template' | 'ssr';
	namespace: ConcreteNamespace;
	readonly elements: Array<Element | undefined>;
	readonly slotNodes: Array<Node | RenderProgramChildAnchor | undefined>;
	componentSlots: number | Set<number>;
	work: readonly [nodes: number, slots: number];
	readonly parents: Array<Node | null>;
	container: Node;
	current: Node | null;
	valid: boolean;
	began: boolean;
};

/** Result of one compiler-wired successful-path claim. */
export type ClaimedRenderProgram = Readonly<{
	elements: readonly (Element | undefined)[];
	slotNodes: readonly (Node | RenderProgramChildAnchor | undefined)[];
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
	const fixtureBinder = (program as unknown as { bind?: (target: object) => void }).bind;
	if (!program.wire && !fixtureBinder) {
		if (!matchesElement(root, program.root[0], program.root[1] ?? program.namespace))
			return undefined;
		return { elements: [root], slotNodes: [], componentSlots: 0, work: program.work };
	}
	const target: ProgramClaimTarget = {
		claiming: true,
		root,
		source,
		namespace: concreteElementNamespace(root),
		elements: [],
		slotNodes: [],
		componentSlots: 0,
		work: [0, 0],
		parents: [],
		container: root,
		current: null,
		valid: true,
		began: false
	};
	if (program.wire) claimCompiledProgramWiring(program.wire, target);
	else fixtureBinder!(target);
	if (target.valid && target.began && target.parents.length === 0)
		return {
			elements: target.elements,
			slotNodes: target.slotNodes,
			componentSlots: target.componentSlots,
			work: target.work
		};
	return undefined;
}

/** Executes one immutable component-local claim sequence against the bounded claim cursor. */
function claimCompiledProgramWiring(
	wiring: ExactRenderProgramWiring,
	target: ExactRenderProgramBindingTarget
): void {
	const [root, claims] = wiring;
	if (!beginCompiledProgramClaims(target, root[0], root[1], root[2], root[3])) return;
	for (const operation of claims) {
		switch (operation[0]) {
			case 0:
				claimCompiledProgramElement(
					target,
					operation[1] as number,
					operation[2] as number,
					operation[3] as string,
					operation[4] as ExactRenderProgram['namespace'] | undefined
				);
				break;
			case 1:
				enterCompiledProgramElement(target, operation[1] as number);
				break;
			case 2:
				leaveCompiledProgramElement(target);
				break;
			case 3:
				claimCompiledProgramText(
					target,
					operation[1] as number,
					operation[2] as number,
					operation[3] as string | true
				);
				break;
			case 4:
				claimCompiledProgramKeyedChild(
					target,
					operation[1] as number,
					operation[2] as number,
					operation[3] === true
				);
				break;
			case 5:
				claimCompiledProgramChild(
					target,
					operation[1] as number,
					operation[2] as number,
					operation[3] as string,
					operation[4] === true
				);
				break;
			case 6:
				claimCompiledProgramElementPath(
					target,
					operation[1] as number,
					operation[2] as number,
					operation[3] as string,
					operation[4] as ExactRenderProgram['namespace'] | undefined
				);
				break;
			case 7:
				claimCompiledProgramProperty(target, operation[1] as number, operation[2] as number);
				break;
			default:
				(target as { valid: boolean }).valid = false;
				return;
		}
	}
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
	target.namespace = concreteElementNamespace(target.root);
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

/** Claims one required intrinsic through its compiler-encoded element-child path. */
export function claimCompiledProgramElementPath(
	target: ExactRenderProgramBindingTarget,
	index: number,
	path: number,
	tag: string,
	namespace?: ExactRenderProgram['namespace']
): void {
	if (!isClaimTarget(target) || !target.valid) return;
	let remaining = Math.floor(path);
	let depth = remaining % 16;
	remaining = Math.floor(remaining / 16);
	let element: Element = target.root;
	while (depth-- > 0) {
		const step = remaining % 128;
		const ordinal = step % 64;
		const child = element.children.item(
			step < 64 ? ordinal : element.children.length - ordinal - 1
		);
		if (!child) {
			target.valid = false;
			return;
		}
		element = child;
		remaining = Math.floor(remaining / 128);
	}
	if (!matchesElement(element, tag, namespace ?? target.namespace)) {
		target.valid = false;
		return;
	}
	target.elements[index] = element;
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
	target.parents.push(target.current, target.container);
	target.container = element;
	target.current = element.firstChild;
}

/** Restores the parent cursor after a compiler-known intrinsic subtree. */
export function leaveCompiledProgramElement(target: ExactRenderProgramBindingTarget): void {
	if (!isClaimTarget(target) || !target.valid) return;
	const container = target.parents.pop();
	const parent = target.parents.pop();
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
	id: string | true
): void {
	if (!isClaimTarget(target) || !target.valid) return;
	if (target.source === 'ssr' && id === true) {
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
	const identity = id === true ? '' : markerIdentity(id);
	const expectedOpen = target.source === 'template' ? '' : `x:${identity}`;
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
	if (!(closing instanceof Comment)) {
		target.valid = false;
		return;
	}
	if (target.source === 'ssr' ? closing.data !== `/x:${identity}` : closing.data !== '') {
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
	if (!(marker instanceof Comment) || marker.data !== `x:${identity}`) {
		target.valid = false;
		return;
	}
	let closing: Comment | undefined;
	for (let candidate = marker.nextSibling; candidate; candidate = candidate.nextSibling) {
		if (candidate instanceof Comment && candidate.data === `/x:${identity}`) {
			closing = candidate;
			break;
		}
	}
	if (!closing) {
		target.valid = false;
		return;
	}
	target.slotNodes[index] = marker;
	if (component) markComponentSlot(target, index);
	target.current = closing.nextSibling;
}

/** Claims a compiler-proven final child range without requiring serialized delimiters. */
export function claimCompiledProgramKeyedChild(
	target: ExactRenderProgramBindingTarget,
	index: number,
	skip: number,
	component = false
): void {
	if (!isClaimTarget(target) || !target.valid) return;
	let start = target.current;
	for (let offset = 0; offset < skip; offset++) {
		if (!start) {
			target.valid = false;
			return;
		}
		start = start.nextSibling;
	}
	target.slotNodes[index] = [target.container, start];
	if (component) markComponentSlot(target, index);
	target.current = null;
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

function concreteElementNamespace(element: Element): ConcreteNamespace {
	return element.namespaceURI === SVG_NAMESPACE
		? 'svg'
		: element.namespaceURI === MATHML_NAMESPACE
			? 'mathml'
			: 'html';
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
