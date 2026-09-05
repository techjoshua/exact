import { createContext, type Child, type Component } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-abi';
import type { MotionConfigProps, MotionSettings } from './contracts.js';

/** Package defaults used outside a `MotionConfig` boundary. */
export const defaultMotionSettings: MotionSettings = Object.freeze({
	enabled: true,
	reducedMotion: 'system',
	transition: Object.freeze({ duration: 180, easing: 'ease-out' }),
	appear: false
});

/** Reactive motion policy inherited through logical component ownership. */
export const MotionContext = createContext<MotionSettings>('motion.settings', {
	global: true,
	keep: 'shared'
});

/** Publishes inherited motion policy for one component subtree. */
export function MotionConfig(this: Component<{}>, props: MotionConfigProps) {
	const parent = this.hasContext(MotionContext)
		? this.getContext(MotionContext)
		: defaultMotionSettings;
	const settings = {
		get enabled() {
			return props.enabled ?? parent.enabled;
		},
		get reducedMotion() {
			return props.reducedMotion ?? parent.reducedMotion;
		},
		get transition() {
			return { ...parent.transition, ...props.transition };
		},
		get appear() {
			return props.appear ?? parent.appear;
		}
	} satisfies MotionSettings;
	this.setContext(MotionContext, settings);
	return () => props.children as Child;
}

/** Issues a compiled `MotionConfig` operation for programmatic callers. */
export function createMotionConfig(props: MotionConfigProps) {
	return createCompiledComponentReceipt(
		MotionConfig,
		props as Record<string, unknown>,
		props.children
	);
}
