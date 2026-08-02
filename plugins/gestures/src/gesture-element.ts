import { markExactComponent, unwrap, watch, type Component } from '@exactjs/core';
import { defaultGestureSettings, GestureContext } from './context.js';
import type { GestureDefinition, GestureElementProps } from './contracts.js';
import { GestureSession } from './session.js';

/** Transparent ordinary component activated for one resolved gesture target. */
export const GestureElement = markExactComponent(function GestureElement(
	this: Component<{}>,
	props: GestureElementProps
) {
	const root = this.refs.root<Element>();
	const settings = this.hasContext(GestureContext)
		? this.getContext(GestureContext)
		: defaultGestureSettings;
	const session = new GestureSession((error) => this.log.error('gesture callback failed', error));

	watch(() => {
		session.configure({
			element: root.current,
			presented: root.presented,
			definition: unwrap(props.apply) as GestureDefinition | undefined,
			disabled: props.disabled ?? false,
			settings,
			overrides: {
				press: unwrap(props.press),
				hover: unwrap(props.hover),
				drag: unwrap(props.drag),
				pan: unwrap(props.pan),
				pinch: unwrap(props.pinch)
			}
		});
	});

	this.onDeactivate(() => session.cancel('gesture-target-deactivated'));
	this.onUnmount(() => session[Symbol.dispose]());
	return () => props.children;
}, '@exactjs/gestures:GestureElement');
