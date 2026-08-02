import { markExactComponent, type Component } from '@exactjs/core';
import { keyedPresenceChild } from './presence.js';
import type { MotionListProps } from './contracts.js';

/** Projects application-owned items into the renderer's existing keyed identity model. */
export const MotionList = markExactComponent(function MotionList(
	this: Component<{}>,
	props: MotionListProps<unknown>
) {
	return () =>
		this.map(
			props.items,
			(item) => String(props.getKey(item)),
			(item) => keyedPresenceChild(props.children(item), String(props.getKey(item))),
			'@exactjs/motion:MotionList'
		);
}, '@exactjs/motion:MotionList');
