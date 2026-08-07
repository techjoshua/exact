import { consumeDomWork, walkDomSubtree, type DomWorkBudget } from '@exactjs/dom';

type FormState = {
	node: Element;
	path: number[];
	identity?: { attribute: string; value: string };
	signature: string;
	value?: string;
	checked?: boolean;
	open?: boolean;
	selected?: boolean[];
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
	const controls: Element[] = [];
	let hasMarkers = false;
	walkDomSubtree(
		container,
		(node) => {
			if (node instanceof Comment && node.data.startsWith('exact:')) hasMarkers = true;
			if (
				node instanceof HTMLInputElement ||
				node instanceof HTMLTextAreaElement ||
				node instanceof HTMLSelectElement ||
				(node instanceof Element && node.getAttribute('contenteditable') === 'true') ||
				isDetailsElement(node)
			)
				controls.push(node);
		},
		{ budget: work }
	);
	const formState = controls.flatMap((control) => {
		const dirty =
			control instanceof HTMLInputElement
				? control.value !== control.defaultValue || control.checked !== control.defaultChecked
				: control instanceof HTMLTextAreaElement
					? control.value !== control.defaultValue
					: control instanceof HTMLSelectElement
						? Array.from(control.options).some(
								(option) => option.selected !== option.defaultSelected
							)
						: isDetailsElement(control)
							? control.open !== (control.getAttribute('data-exact-ssr-open') === 'true')
							: control.textContent !== control.getAttribute('data-exact-ssr-text');
		if (!dirty && control !== active) return [];
		const state: FormState = {
			node: control,
			path: nodePath(container, control, work),
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
			state.selected = Array.from(control.options, (option) => option.selected);
		} else if (isDetailsElement(control)) {
			state.open = control.open;
		} else state.value = control.textContent ?? '';
		return [state];
	});
	return { formState, hasMarkers };
}

/** Restores captured values, selection, and focus using stable identity before positional fallback. */
export function restoreFormState(
	container: Element,
	states: readonly FormState[],
	work: DomWorkBudget
): Element[] {
	if (!states.length) return [];
	const restored: Element[] = [];
	const identities = indexFormControlIdentities(container, work);
	for (const state of states) {
		const identityMatch = state.identity
			? identities.get(`${state.identity.attribute}\0${state.identity.value}`)
			: undefined;
		const pathMatch = nodeAtPath(container, state.path, work);
		const retainedIdentity =
			container.contains(state.node) &&
			(!state.identity ||
				state.node.getAttribute(state.identity.attribute) === state.identity.value);
		const candidate = retainedIdentity ? state.node : (identityMatch ?? pathMatch);
		const control =
			candidate instanceof Element && formControlSignature(candidate) === state.signature
				? candidate
				: undefined;
		if (!(control instanceof Element)) continue;
		restored.push(control);
		if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
			if (state.value !== undefined) control.value = state.value;
			if (control instanceof HTMLInputElement && state.checked !== undefined)
				control.checked = state.checked;
			if (state.focused) control.focus({ preventScroll: true });
			if (state.selection && state.selection.start !== null && state.selection.end !== null) {
				control.setSelectionRange(
					state.selection.start,
					state.selection.end,
					state.selection.direction ?? undefined
				);
			}
		} else if (control instanceof HTMLSelectElement && state.selected) {
			Array.from(control.options).forEach((option, index) => {
				option.selected = state.selected![index] ?? false;
			});
			if (state.focused) control.focus({ preventScroll: true });
		} else if (isDetailsElement(control) && state.open !== undefined) {
			control.open = state.open;
		} else if (state.value !== undefined) {
			control.textContent = state.value;
			if (state.focused && control instanceof HTMLElement) control.focus({ preventScroll: true });
		}
	}
	return restored;
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

function formControlSignature(element: Element): string {
	const type = element instanceof HTMLInputElement ? element.type : '';
	return `${element.namespaceURI ?? ''}|${element.localName}|${type}|${element.getAttribute('name') ?? ''}`;
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

function nodePath(root: Node, node: Node, work: DomWorkBudget): number[] {
	const path: number[] = [];
	for (let cursor: Node | null = node; cursor && cursor !== root; cursor = cursor.parentNode) {
		consumeDomWork(work);
		if (!cursor.parentNode) return [];
		path.unshift(Array.prototype.indexOf.call(cursor.parentNode.childNodes, cursor));
	}
	return path;
}

function nodeAtPath(root: Node, path: readonly number[], work: DomWorkBudget): Node | undefined {
	let cursor: Node | undefined = root;
	for (const index of path) {
		consumeDomWork(work);
		cursor = cursor?.childNodes[index];
	}
	return cursor;
}
