import {
	createRef,
	type AnyAuthoredComponentFunction,
	type Child,
	type Component
} from '@exactjs/core';
import type { AccessibilityProps } from './contracts.js';
import { FocusScopeSession } from './focus-scope.js';
import { CompositeNavigationSession } from './navigation.js';
import { createRelationshipContributions } from './relationships.js';

const accessibilityTargetKey = createRef<HTMLElement>('accessibility enhancement target');
declare const _target: AnyAuthoredComponentFunction;

/** Canonical enhancement component for native-first accessibility coordination. */
export function Accessibility(this: Component<{}>, props: AccessibilityProps): () => Child {
	const target = this.refs.root(this.ref(accessibilityTargetKey));
	let focus: FocusScopeSession | undefined;
	let navigation: CompositeNavigationSession | undefined;
	this.onMount(() => {
		focus = this.own(new FocusScopeSession(target, props));
		navigation = this.own(new CompositeNavigationSession(target, props));
		focus.reconcile();
		navigation.reconcile();
	});
	this.onRender(() => {
		focus?.reconcile();
		navigation?.reconcile();
	});
	return () => (
		<_target ref={target} {...createRelationshipContributions(props)}>
			{props.children}
		</_target>
	);
}
