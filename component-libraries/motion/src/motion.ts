import { createVNode, type Component } from '@exactjs/core';
import { markExactComponent } from '@exactjs/core/framework/component-contracts';
import type { MotionElementProps, MotionProps } from './contracts.js';
import { MotionElement } from './motion-element.js';

const motionKeys = new Set(['motion', 'enter', 'change', 'leave', 'appear', 'layout', 'layoutId']);

/** Explicit compilerless component that owns one real intrinsic motion target. */
export const Motion = markExactComponent(function Motion(this: Component<{}>, props: MotionProps) {
	return () => {
		const intrinsic: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(props)) {
			if (key !== 'as' && key !== 'children' && !motionKeys.has(key)) intrinsic[key] = value;
		}
		const motion: MotionElementProps = {
			apply: props.motion ?? props.apply,
			enter: props.enter,
			change: props.change,
			leave: props.leave,
			appear: props.appear,
			layout: props.layout,
			layoutId: props.layoutId,
			children: createVNode(props.as, intrinsic, props.children)
		};
		return createVNode(
			MotionElement,
			motion as unknown as Record<string, unknown>,
			motion.children
		);
	};
}, '@exactjs/motion:Motion');
