import { createEnhancementNode, createRef, type Component } from '@exactjs/core';

const labelKey = createRef<HTMLSpanElement>('hydrated accessibility label');
const identity = '@exactjs/accessibility/enhancements#labelledBy';

function AccessibilityPage(this: Component<{}>) {
	const label = this.ref(labelKey);
	return () => [
		<span ref={label}>Account email</span>,
		<input
			__exactEnhancements={createEnhancementNode([{ identity, props: { labelledBy: label } }])}
		/>
	];
}

/** Compiler-issued root for accessibility relationship adoption. */
export const accessibilityPageRoot = <AccessibilityPage />;
