import { peek, type Component } from '@exactjs/core';
import {
	createCompiledComponentReceipt,
	createCompiledIntrinsicReceipt
} from '@exactjs/core/runtime/component-abi';
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
		children: createCompiledIntrinsicReceipt(intrinsicType, intrinsic, props.children)
	};
	return createCompiledComponentReceipt(
		MotionElement,
		motion as unknown as Record<string, unknown>,
		motion.children
	);
}
