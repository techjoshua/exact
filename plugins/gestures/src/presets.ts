import { defineGesture } from './definitions.js';

/** Basic click-like press recognition policy. */
export const pressable = defineGesture({ name: 'pressable', press: {} });
/** Pointer-hover and keyboard-focus intent policy. */
export const hoverable = defineGesture({ name: 'hoverable', hover: {} });
/** Thresholded two-axis drag policy with keyboard movement defaults. */
export const draggable = defineGesture({
	name: 'draggable',
	drag: { axis: 'both', threshold: 4, lockDirection: false },
	keyboard: { step: 8 },
	touchAction: 'none'
});
/** Thresholded free-pan policy. */
export const pannable = defineGesture({
	name: 'pannable',
	pan: { axis: 'both', threshold: 4 },
	touchAction: 'none'
});
/** Two-pointer scale and rotation policy. */
export const pinchable = defineGesture({
	name: 'pinchable',
	pinch: { threshold: 0.02 },
	touchAction: 'none'
});
/** Press policy requiring a 500 millisecond hold. */
export const longPress = defineGesture({
	name: 'longPress',
	press: { threshold: 6, delay: 500 }
});
