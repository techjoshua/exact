/* eslint-disable @typescript-eslint/no-unused-vars -- exactc consumes the enhancement namespace in JSX attributes. */
import * as a11y from '@exactjs/accessibility/enhancements' with { type: 'exact-enhancement' };
import { createRef, type Component } from '@exactjs/core';
const helpKey = createRef<HTMLSpanElement>('audit help');
const entryKey = createRef<HTMLInputElement>('audit entry');
/** Exercises optional ref contributions alongside authored intrinsic attributes. */
export function Relationships(this: Component<{}>, props: { enabled: boolean }) {
	const help = this.ref(helpKey);
	return () => (
		<section>
			<button
				aria-controls="authored-controls"
				aria-label="Authored label"
				a11y:described-by={props.enabled ? help : false}
			>
				Action
			</button>
			<span ref={help}>Help</span>
		</section>
	);
}
/** Exercises entry, retained publication and return-focus ownership. */
export function Focus(this: Component<{}>) {
	const entry = this.ref(entryKey);
	return () => (
		<section a11y:focus-scope a11y:initial-focus={entry}>
			<input ref={entry} aria-label="Entry" />
		</section>
	);
}
/** Places two independent navigation owners around a nonwrapping inner boundary. */
export function Nested(this: Component<{}>) {
	return () => (
		<div role="listbox" aria-label="Outer" a11y:navigate>
			<div role="option">
				Outer first
				<div role="listbox" aria-label="Inner" a11y:navigate>
					<div role="option">Inner first</div>
					<div role="option">Inner last</div>
				</div>
			</div>
			<div role="option">Outer last</div>
		</div>
	);
}
import { render, type RenderOptions } from '@exactjs/dom/root';
import { currentEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
/** Publicly observable owner of the shared accessibility publication fixture. */
export let accessibilityOwner: Component<{}> | undefined;
/** Root ref used to distinguish retained adoption from recovery. */
export const accessibilityRoot = createRef<HTMLElement>('accessibility owner root');
/** Attributes disposal to the actual publication owner. */
export const accessibilityReleased: Component<{}>[] = [];
/** Scope used to check lifecycle release in browser acceptance. */
export let accessibilityScope: EffectScope | undefined;
/** Shares relationships, focus and nested keyboard ownership across native publication paths. */
export function AccessibilityOwnership(this: Component<{}>, props: { enabled?: boolean }) {
	accessibilityOwner = this;
	accessibilityScope = currentEffectScope();
	this.onUnmount(() => {
		accessibilityReleased.push(this);
	});
	return () => (
		<section id="accessibility-ownership" ref={this.ref(accessibilityRoot)}>
			<Relationships enabled={props.enabled ?? true} />
			<Focus />
			<Nested />
		</section>
	);
}
/** Mounts the authored contract through the ordinary compiled public root. */
export function mountAccessibilityOwnership(
	host: Element,
	enabled: boolean,
	options: RenderOptions
) {
	render(<AccessibilityOwnership enabled={enabled} />, host, options);
}
