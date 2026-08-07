import type { RefBinding } from '@exactjs/core';

type SemanticState = {
	owners: Map<symbol, 'retain' | 'pop'>;
	inert: boolean;
	pointerEvents: string;
	ariaHidden: string | null;
	position: string;
	top: string;
	left: string;
	width: string;
	height: string;
	popped: boolean;
};

const semanticStates = new WeakMap<HTMLElement, SemanticState>();

/** Makes one retained target semantically absent until every observing owner releases it. */
export function acquireSemanticAbsence(
	target: Element,
	owner: symbol,
	options: {
		returnFocus?: RefBinding<HTMLElement>;
		exitLayout?: 'retain' | 'pop';
	} = {}
): void {
	if (!(target instanceof HTMLElement)) return;
	let state = semanticStates.get(target);
	if (!state) {
		state = captureState(target);
		semanticStates.set(target, state);
		moveFocus(target, options.returnFocus);
		target.inert = true;
		target.style.pointerEvents = 'none';
		if (!target.contains(target.ownerDocument.activeElement)) {
			target.setAttribute('aria-hidden', 'true');
		}
	}
	state.owners.set(owner, options.exitLayout ?? 'retain');
	if (options.exitLayout === 'pop' && !state.popped) popOutOfLayout(target, state);
}

/** Releases one semantic-absence claim and restores authored state after the final claim. */
export function releaseSemanticAbsence(target: Element | undefined, owner: symbol): void {
	if (!(target instanceof HTMLElement)) return;
	const state = semanticStates.get(target);
	if (!state) return;
	state.owners.delete(owner);
	if (state.owners.size) return;
	restoreState(target, state);
	semanticStates.delete(target);
}

function captureState(target: HTMLElement): SemanticState {
	return {
		owners: new Map(),
		inert: target.inert === true,
		pointerEvents: target.style.pointerEvents,
		ariaHidden: target.getAttribute('aria-hidden'),
		position: target.style.position,
		top: target.style.top,
		left: target.style.left,
		width: target.style.width,
		height: target.style.height,
		popped: false
	};
}

function moveFocus(target: HTMLElement, returnFocus?: RefBinding<HTMLElement>): void {
	const active = target.ownerDocument.activeElement;
	if (!active || !target.contains(active)) return;
	const returnTarget = returnFocus?.current;
	if (returnTarget?.isConnected) returnTarget.focus();
	else if (active instanceof HTMLElement) active.blur();
}

function popOutOfLayout(target: HTMLElement, state: SemanticState): void {
	const bounds = target.getBoundingClientRect();
	target.style.position = 'fixed';
	target.style.top = `${bounds.top}px`;
	target.style.left = `${bounds.left}px`;
	target.style.width = `${bounds.width}px`;
	target.style.height = `${bounds.height}px`;
	state.popped = true;
}

function restoreState(target: HTMLElement, state: SemanticState): void {
	target.inert = state.inert;
	target.style.pointerEvents = state.pointerEvents;
	target.style.position = state.position;
	target.style.top = state.top;
	target.style.left = state.left;
	target.style.width = state.width;
	target.style.height = state.height;
	if (state.ariaHidden === null) target.removeAttribute('aria-hidden');
	else target.setAttribute('aria-hidden', state.ariaHidden);
}
