import { markExactComponent, type Component } from '@exactjs/core';
import { watch } from '@exactjs/core';
import { LayoutContext } from './layout.js';
import { keyedPresenceChild } from './presence.js';
import type { MotionListProps } from './contracts.js';

/** Projects application-owned items into the renderer's existing keyed identity model. */
export const MotionList = markExactComponent(function MotionList(
	this: Component<{}>,
	props: MotionListProps<unknown>
) {
	if (this.hasContext(LayoutContext)) {
		const layout = this.getContext(LayoutContext);
		let initialized = false;
		watch(() => {
			for (const item of props.items) props.getKey(item);
			if (initialized) {
				layout.snapshot();
				queueMicrotask(() => layout.animate());
			} else initialized = true;
		});
	}
	return () =>
		this.map(
			props.items,
			(item) => String(props.getKey(item)),
			(item) =>
				keyedPresenceChild(props.children(item), String(props.getKey(item)), props.exitLayout),
			'@exactjs/motion:MotionList'
		);
}, '@exactjs/motion:MotionList');
