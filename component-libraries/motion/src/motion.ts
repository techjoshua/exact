import { createVNode, peek, type AnyComponentFunction, type Component } from '@exactjs/core';
import type { MotionElementProps, MotionProps } from './contracts.js';
import { MotionElement } from './motion-element.js';

const motionKeys = new Set(['motion', 'enter', 'change', 'leave', 'appear', 'layout', 'layoutId']);

/** Component that owns one real intrinsic motion target. */
export function Motion(this: Component<{}>, props: MotionProps) {
	const intrinsicType = peek(() => props.as);
	return () => renderMotion(props, intrinsicType);
}

/** @exact pure */
function renderMotion(props: MotionProps, intrinsicType: MotionProps['as']) {
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
		children: createVNode(intrinsicType, intrinsic, props.children)
	};
	return createVNode(
		MotionElement as unknown as AnyComponentFunction,
		motion as unknown as Record<string, unknown>,
		motion.children
	);
}
