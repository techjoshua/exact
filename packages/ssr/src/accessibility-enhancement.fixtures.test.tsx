/* eslint-disable @typescript-eslint/no-unused-vars -- exactc consumes enhancement namespace bindings from JSX attributes. */
import { describedBy as a11y } from '@exactjs/accessibility/enhancements' with { type: 'exact-enhancement' };
import { createRef, type Component } from '@exactjs/core';

const helpKey = createRef<HTMLSpanElement>('accessibility SSR help');

export const accessibilityEnhancementIdentity = '@exactjs/accessibility/enhancements#describedBy';

/** Compiler-produced server fixture for accessibility relationship ownership. */
export function AccessibilityPage(this: Component<{}>) {
	const help = this.ref(helpKey);
	return () => (
		<>
			<button a11y:described-by={help}>Delete</button>
			<span ref={help}>Cannot be undone</span>
		</>
	);
}
