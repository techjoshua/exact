import {
	consumeDomWork,
	walkDomSubtree,
	type DomWorkBudget
} from '@exactjs/dom/framework/component-root';

import {
	captureInteractionControlState,
	restoreInteractionControlState
} from '../islands/interaction-control-state.js';

type FormState = {
	node: Element;
	path: number[];
	identity?: { attribute: string; value: string };
	signature: string;
	value?: string;
	checked?: boolean;
	open?: boolean;
	modal?: boolean;
	selected?: readonly string[];
	selection?: {
		start: number | null;
		end: number | null;
		direction?: 'forward' | 'backward' | 'none' | null;
	};
	focused: boolean;
};

/** Form state captured before hydration may repair or replace server-rendered nodes. */
export type HydrationDomSnapshot = { formState: FormState[]; hasMarkers: boolean };

/** Captures dirty or focused form controls and detects eXact hydration markers in one bounded walk. */
export function captureHydrationDom(container: Element, work: DomWorkBudget): HydrationDomSnapshot {
	const active = document.activeElement;
	const formState: FormState[] = [];
	const positions = new WeakMap<Node, number>();
	let hasMarkers = false;
	walkDomSubtree(
		container,
		(node) => {
			// The walk visits every preceding sibling before this node, including comments and text.
			if (node !== container)
				positions.set(node, node.previousSibling ? positions.get(node.previousSibling)! + 1 : 0);
			if (node.nodeType === Node.COMMENT_NODE) {
				if ((node as Comment).data.startsWith('exact:')) hasMarkers = true;
				return;
			}
			if (node.nodeType !== Node.ELEMENT_NODE) return;
			const element = node as Element;
			if (
				element.localName !== 'input' &&
				element.localName !== 'textarea' &&
				element.localName !== 'select' &&
				element.localName !== 'details' &&
				element.localName !== 'dialog' &&
				!isExplicitlyEditable(element)
			)
				return;
			const control = element;
			const dirty = isDirtyControl(control);
			if (!dirty && control !== active) return;
			const state: FormState = {
				node: control,
				path: nodePath(container, control, positions, work),
				identity: formControlIdentity(control),
				signature: formControlSignature(control),
				focused: control === active
			};
			if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
				state.value = control.value;
				if (control instanceof HTMLInputElement) state.checked = control.checked;
				state.selection = {
					start: control.selectionStart,
					end: control.selectionEnd,
					direction: control.selectionDirection
				};
			} else if (control instanceof HTMLSelectElement) {
				state.selected = captureInteractionControlState(control).selected;
			} else if (isDetailsElement(control)) {
				state.open = control.open;
			} else if (isDialogElement(control)) {
				state.open = control.open;
				state.modal = isModalDialog(control);
			} else state.value = control.textContent ?? '';
			formState.push(state);
		},
		{ budget: work }
	);
	return { formState, hasMarkers };
}

/** Restores captured controls while the receiving attempt remains current, fencing focus reentry. */
export function restoreFormState(
	container: Element,
	states: readonly FormState[],
	work: DomWorkBudget,
	isCurrent: () => boolean = () => true
): Element[] {
	if (!states.length) return [];
	const restored: Element[] = [];
	let identities: Map<string, Element | undefined> | undefined;
	for (const state of states) {
		if (!isCurrent()) break;
		const retainedIdentity =
			container.contains(state.node) &&
			(!state.identity ||
				state.node.getAttribute(state.identity.attribute) === state.identity.value);
		let candidate: Element | Node | undefined = retainedIdentity ? state.node : undefined;
		if (!candidate) {
			if (state.identity) {
				identities ??= indexFormControlIdentities(container, work);
				candidate = identities.get(`${state.identity.attribute}\0${state.identity.value}`);
			} else candidate = nodeAtPath(container, state.path, work);
		}
		const control =
			candidate instanceof Element && formControlSignature(candidate) === state.signature
				? candidate
				: undefined;
		if (!(control instanceof Element)) continue;
		restored.push(control);
		if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
			// File selections remain browser-owned. Even assigning their existing path throws.
			if (
				state.value !== undefined &&
				!(control instanceof HTMLInputElement && control.type === 'file')
			)
				control.value = state.value;
			if (control instanceof HTMLInputElement && state.checked !== undefined)
				control.checked = state.checked;
			if (state.focused) control.focus({ preventScroll: true });
			if (!isCurrent()) break;
			if (state.selection && state.selection.start !== null && state.selection.end !== null) {
				control.setSelectionRange(
					state.selection.start,
					state.selection.end,
					state.selection.direction ?? undefined
				);
			}
		} else if (control instanceof HTMLSelectElement && state.selected) {
			restoreInteractionControlState(control, { selected: state.selected });
			if (state.focused) control.focus({ preventScroll: true });
		} else if (isDetailsElement(control) && state.open !== undefined) {
			control.open = state.open;
		} else if (isDialogElement(control) && state.modal !== undefined) {
			if (state.modal && !isModalDialog(control)) {
				if (control.open) control.close();
				if (!isCurrent()) break;
				control.showModal();
			} else if (!state.modal) {
				if (isModalDialog(control)) control.close();
				if (!isCurrent()) break;
				control.open = state.open ?? false;
			}
		} else if (state.value !== undefined) {
			if (control.textContent !== state.value) control.textContent = state.value;
			if (isCurrent() && state.focused && control instanceof HTMLElement)
				control.focus({ preventScroll: true });
		}
	}
	return restored;
}

function isDirtyControl(control: Element): boolean {
	if (control instanceof HTMLInputElement)
		return control.value !== control.defaultValue || control.checked !== control.defaultChecked;
	if (control instanceof HTMLTextAreaElement) return control.value !== control.defaultValue;
	if (control instanceof HTMLSelectElement) {
		const options = Array.from(control.options);
		if (control.multiple)
			return options.some((option) => option.selected !== option.defaultSelected);
		// The browser selects the last explicit default, or the first enabled option for a
		// single-row control. That implicit selection is pristine, not a user edit to restore.
		let expected = -1;
		for (let index = 0; index < options.length; index++)
			if (options[index]!.defaultSelected) expected = index;
		if (expected === -1 && control.size <= 1)
			expected = options.findIndex(
				(option) =>
					!option.disabled &&
					!(option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled)
			);
		return control.selectedIndex !== expected;
	}
	if (isDetailsElement(control))
		return control.open !== (control.getAttribute('data-exact-ssr-open') === 'true');
	if (isDialogElement(control))
		return control.hasAttribute('data-exact-ssr-open')
			? control.open !== (control.getAttribute('data-exact-ssr-open') === 'true')
			: control.open;
	return control.textContent !== control.getAttribute('data-exact-ssr-text');
}

function formControlIdentity(element: Element): { attribute: string; value: string } | undefined {
	for (const attribute of ['data-exact-control-id', 'data-exact-id', 'id', 'name'] as const) {
		const value = element.getAttribute(attribute);
		if (value) return { attribute, value };
	}
	return undefined;
}

function isDetailsElement(value: unknown): value is HTMLDetailsElement {
	return value instanceof Element && value.localName === 'details' && 'open' in value;
}

function isDialogElement(value: unknown): value is HTMLDialogElement {
	return value instanceof Element && value.localName === 'dialog' && 'open' in value;
}

function isModalDialog(control: HTMLDialogElement): boolean {
	return typeof control.showModal === 'function' && control.matches(':modal');
}

function isExplicitlyEditable(element: Element): boolean {
	const value = element.getAttribute('contenteditable')?.toLowerCase();
	return value === '' || value === 'true' || value === 'plaintext-only';
}

function formControlSignature(element: Element): string {
	const type = element instanceof HTMLInputElement ? element.type : '';
	const option =
		element instanceof HTMLInputElement && (type === 'checkbox' || type === 'radio')
			? element.value
			: '';
	return JSON.stringify([
		element.namespaceURI ?? '',
		element.localName,
		type,
		element.getAttribute('name') ?? '',
		option,
		isExplicitlyEditable(element)
	]);
}

function indexFormControlIdentities(
	container: Element,
	work: DomWorkBudget
): Map<string, Element | undefined> {
	const identities = new Map<string, Element | undefined>();
	walkDomSubtree(
		container,
		(node) => {
			if (!(node instanceof Element)) return;
			for (const attribute of ['data-exact-control-id', 'data-exact-id', 'id', 'name'] as const) {
				const value = node.getAttribute(attribute);
				if (!value) continue;
				const key = `${attribute}\0${value}`;
				identities.set(key, identities.has(key) ? undefined : node);
			}
		},
		{ budget: work }
	);
	return identities;
}

function nodePath(
	root: Node,
	node: Node,
	positions: WeakMap<Node, number>,
	work: DomWorkBudget
): number[] {
	const path: number[] = [];
	for (let cursor: Node | null = node; cursor && cursor !== root; cursor = cursor.parentNode) {
		consumeDomWork(work);
		if (!cursor.parentNode) return [];
		path.push(positions.get(cursor)!);
	}
	return path.reverse();
}

function nodeAtPath(root: Node, path: readonly number[], work: DomWorkBudget): Node | undefined {
	let cursor: Node | undefined = root;
	for (const index of path) {
		consumeDomWork(work);
		cursor = cursor?.childNodes[index];
	}
	return cursor;
}
