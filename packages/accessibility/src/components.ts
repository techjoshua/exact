import { createCompiledTarget, createRef, markExactComponent, type Component } from '@exactjs/core';
import type { AccessibilityProps } from './contracts.js';
import { FocusScopeSession } from './focus-scope.js';
import { CompositeNavigationSession } from './navigation.js';
import { createRelationshipContributions } from './relationships.js';

const accessibilityTargetKey = createRef<HTMLElement>('accessibility enhancement target');

/** Canonical enhancement component for native-first accessibility coordination. */
export function Accessibility(this: Component<{}>, props: AccessibilityProps) {
	const target = this.refs.root(this.ref(accessibilityTargetKey));
	const focus = new FocusScopeSession(target, props);
	const navigation = new CompositeNavigationSession(target, props);
	const relationships = createRelationshipContributions(props);
	this.onMount(() => {
		focus.reconcile();
		navigation.reconcile();
	});
	this.onRender(() => {
		focus.reconcile();
		navigation.reconcile();
	});
	this.onUnmount(() => {
		focus.dispose();
		navigation.dispose();
	});
	return () => createCompiledTarget({ ref: target, ...relationships }, props.children);
}

markExactComponent(Accessibility, '@exactjs/accessibility:Accessibility');
