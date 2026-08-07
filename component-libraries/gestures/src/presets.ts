import { defineGesture } from './definitions.js';

/** Basic click-like press recognition policy. */
export const pressable = defineGesture({
	name: 'pressable',
	semantics: 'control',
	press: {},
	keyboard: {}
});
/** Pointer-hover and keyboard-focus intent policy. */
export const hoverable = defineGesture({ name: 'hoverable', semantics: 'decorative', hover: {} });
/** Thresholded two-axis drag policy with keyboard movement defaults. */
export const draggable = defineGesture({
	name: 'draggable',
	semantics: 'control',
	drag: { axis: 'both', threshold: 4, lockDirection: false },
	keyboard: { step: 8 },
	touchAction: 'none'
});
/** Thresholded free-pan policy. */
export const pannable = defineGesture({
	name: 'pannable',
	semantics: 'decorative',
	pan: { axis: 'both', threshold: 4 },
	touchAction: 'none'
});
/** Two-pointer scale and rotation policy. */
export const pinchable = defineGesture({
	name: 'pinchable',
	semantics: 'decorative',
	pinch: { threshold: 0.02 },
	touchAction: 'none'
});
/** Press policy requiring a 500 millisecond hold. */
export const longPress = defineGesture({
	name: 'longPress',
	semantics: 'control',
	press: { threshold: 6, delay: 500 },
	keyboard: {}
});
