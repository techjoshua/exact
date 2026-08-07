import { defineMotion } from './definitions.js';

/** Fades an element without claiming transform. */
export const fade = defineMotion({
	enter: { keyframes: [{ opacity: 0 }, { opacity: 1 }] },
	leave: { keyframes: [{ opacity: 1 }, { opacity: 0 }] }
});

/** Applies a subtle scale transition. */
export const scale = defineMotion({
	enter: { keyframes: [{ transform: 'scale(.96)' }, { transform: 'none' }] },
	leave: { keyframes: [{ transform: 'none' }, { transform: 'scale(.96)' }] }
});

/** Combines opacity and scale for dialogs and overlays. */
export const pop = defineMotion({
	enter: {
		keyframes: [
			{ opacity: 0, transform: 'scale(.96)' },
			{ opacity: 1, transform: 'none' }
		]
	},
	leave: {
		keyframes: [
			{ opacity: 1, transform: 'none' },
			{ opacity: 0, transform: 'scale(.96)' }
		]
	}
});

function slide(x: string, y: string) {
	return defineMotion({
		enter: {
			keyframes: [
				{ opacity: 0, transform: `translate(${x}, ${y})` },
				{ opacity: 1, transform: 'none' }
			]
		},
		leave: {
			keyframes: [
				{ opacity: 1, transform: 'none' },
				{ opacity: 0, transform: `translate(${x}, ${y})` }
			]
		}
	});
}

/** Slides upward from below. */
export const slideUp = slide('0', '8px');
/** Slides downward from above. */
export const slideDown = slide('0', '-8px');
/** Slides leftward from the right. */
export const slideLeft = slide('8px', '0');
/** Slides rightward from the left. */
export const slideRight = slide('-8px', '0');
