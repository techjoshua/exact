import { createContext, markExactComponent, type Child, type Component } from '@exactjs/core';
import type { GestureConfigProps, GestureSettings } from './contracts.js';

/** Defaults used outside an authored GestureConfig boundary. */
export const defaultGestureSettings: GestureSettings = Object.freeze({
	enabled: true,
	dragThreshold: 4,
	pressThreshold: 6
});

/** Reactive gesture policy inherited through logical component ownership. */
export const GestureContext = createContext<GestureSettings>('gesture.settings', {
	global: true,
	keep: 'shared'
});

/** Publishes inherited gesture recognition policy for one logical subtree. */
export const GestureConfig = markExactComponent(function GestureConfig(
	this: Component<{}>,
	props: GestureConfigProps
) {
	const parent = this.hasContext(GestureContext)
		? this.getContext(GestureContext)
		: defaultGestureSettings;
	this.setContext(GestureContext, {
		get enabled() {
			return props.enabled ?? parent.enabled;
		},
		get dragThreshold() {
			return props.dragThreshold ?? parent.dragThreshold;
		},
		get pressThreshold() {
			return props.pressThreshold ?? parent.pressThreshold;
		}
	});
	return () => props.children as Child;
}, '@exactjs/gestures:GestureConfig');
