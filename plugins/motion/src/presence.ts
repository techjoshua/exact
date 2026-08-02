import {
	createVNode,
	isVNode,
	markExactComponent,
	watch,
	type Child,
	type Component,
	type RootRelease,
	type VNode
} from '@exactjs/core';
import type { PresenceProps } from './contracts.js';

type PresenceRangeProps = Readonly<{
	children?: Child;
	returnFocus?: PresenceProps['returnFocus'];
}>;

/** Conditionally projects children through generation-fenced renderer release and reversal. */
export const Presence = markExactComponent(function Presence(
	this: Component<{}>,
	props: PresenceProps
) {
	return () => {
		if (!props.when) return null;
		const children = Array.isArray(props.children) ? props.children : [props.children];
		return children.map((child, index) => {
			if (child === null || child === undefined || child === false || child === true) return child;
			const key = isVNode(child) ? (child.key ?? `presence:${index}`) : `presence:${index}`;
			return createVNode(PresenceRange, { key, returnFocus: props.returnFocus }, child);
		});
	};
}, '@exactjs/motion:Presence');

const PresenceRange = markExactComponent(function PresenceRange(
	this: Component<{}>,
	props: PresenceRangeProps
) {
	const root = this.refs.root<Element>();
	let semanticRelease:
		| {
				target: HTMLElement;
				inert: boolean;
				pointerEvents: string;
				ariaHidden: string | null;
		  }
		| undefined;

	watch(() => {
		const release = root.release;
		if (release) makeSemanticallyAbsent(release, props, (value) => (semanticRelease = value));
		else if (root.current && semanticRelease?.target === root.current) {
			restoreSemanticPresence(semanticRelease);
			semanticRelease = undefined;
		}
	});

	return () => props.children;
}, '@exactjs/motion:PresenceRange');

function makeSemanticallyAbsent(
	release: RootRelease<Element>,
	props: PresenceRangeProps,
	publish: (state: NonNullable<ReturnType<typeof semanticState>>) => void
): void {
	if (!(release.target instanceof HTMLElement)) return;
	const target = release.target;
	const state = semanticState(target);
	if (!state) return;
	const active = target.ownerDocument.activeElement;
	if (active && target.contains(active)) {
		const returnTarget = props.returnFocus?.current;
		if (returnTarget?.isConnected) returnTarget.focus();
		else if (active instanceof HTMLElement) active.blur();
	}
	target.inert = true;
	target.style.pointerEvents = 'none';
	if (!target.contains(target.ownerDocument.activeElement))
		target.setAttribute('aria-hidden', 'true');
	publish(state);
}

function semanticState(target: HTMLElement) {
	return {
		target,
		inert: target.inert === true,
		pointerEvents: target.style.pointerEvents,
		ariaHidden: target.getAttribute('aria-hidden')
	};
}

function restoreSemanticPresence(state: NonNullable<ReturnType<typeof semanticState>>): void {
	state.target.inert = state.inert;
	state.target.style.pointerEvents = state.pointerEvents;
	if (state.ariaHidden === null) state.target.removeAttribute('aria-hidden');
	else state.target.setAttribute('aria-hidden', state.ariaHidden);
}

/** Applies a stable key to a projected child without changing its authored component identity. */
export function keyedPresenceChild(child: Child, key: string): VNode {
	return isVNode(child) ? { ...child, key } : createVNode(PresenceRange, { key }, child);
}
