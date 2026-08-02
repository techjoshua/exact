import {
	createContext,
	createVNode,
	isVNode,
	markExactComponent,
	watch,
	type Child,
	type Component,
	type VNode
} from '@exactjs/core';
import type { PresenceProps } from './contracts.js';
import { acquireSemanticAbsence, releaseSemanticAbsence } from './semantics.js';

type PresenceRangeProps = Readonly<{
	children?: Child;
	returnFocus?: PresenceProps['returnFocus'];
	exitLayout?: 'retain' | 'pop';
}>;

/** Internal collection-exit policy inherited by a motion-decorated list root. */
export const ExitLayoutContext =
	createContext<Readonly<{ mode: 'retain' | 'pop' }>>('motion.exit-layout');

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
	const semanticOwner = Symbol('motion.presence');
	let semanticTarget: Element | undefined;
	if (props.exitLayout) {
		this.setContext(ExitLayoutContext, {
			get mode() {
				return props.exitLayout ?? 'retain';
			}
		});
	}

	watch(() => {
		const release = root.release;
		if (release) {
			semanticTarget = release.target;
			acquireSemanticAbsence(release.target, semanticOwner, props);
		} else if (semanticTarget) {
			releaseSemanticAbsence(semanticTarget, semanticOwner);
			semanticTarget = undefined;
		}
	});
	this.onUnmount(() => releaseSemanticAbsence(semanticTarget, semanticOwner));

	return () => props.children;
}, '@exactjs/motion:PresenceRange');

/** Applies a stable key and optional exit-layout owner to one projected list child. */
export function keyedPresenceChild(
	child: Child,
	key: string,
	exitLayout?: 'retain' | 'pop'
): VNode {
	if (exitLayout === 'pop') return createVNode(PresenceRange, { key, exitLayout }, child);
	return isVNode(child) ? { ...child, key } : createVNode(PresenceRange, { key }, child);
}
