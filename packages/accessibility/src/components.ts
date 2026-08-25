import { createRef, type Component } from '@exactjs/core';
import { createCompiledTarget } from '@exactjs/core/runtime/render';
import type { AccessibilityProps } from './contracts.js';
import { FocusScopeSession } from './focus-scope.js';
import { CompositeNavigationSession } from './navigation.js';
import { createRelationshipContributions } from './relationships.js';

const accessibilityTargetKey = createRef<HTMLElement>('accessibility enhancement target');

/** Canonical enhancement component for native-first accessibility coordination. */
export function Accessibility(this: Component<{}>, props: AccessibilityProps) {
	const target = this.refs.root(this.ref(accessibilityTargetKey));
	const focus = this.own(new FocusScopeSession(target, props));
	const navigation = this.own(new CompositeNavigationSession(target, props));
	this.onMount(() => {
		focus.reconcile();
		navigation.reconcile();
	});
	this.onRender(() => {
		focus.reconcile();
		navigation.reconcile();
	});
	return () =>
		createCompiledTarget(
			{ ref: target, ...createRelationshipContributions(props) },
			props.children
		);
}
