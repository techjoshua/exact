import { describe, expect, it } from 'vitest';
import { defineDrag, defineGesture, isGestureDefinition } from './definitions.js';
import { draggable, longPress, pressable } from './presets.js';

describe('gesture definitions', () => {
	it('prepares immutable reusable definitions and recognizers', () => {
		const drag = defineDrag({ threshold: 5, axis: 'x' });
		const definition = defineGesture({ name: 'card', drag });
		expect(isGestureDefinition(definition)).toBe(true);
		expect(Object.isFrozen(definition)).toBe(true);
		expect(Object.isFrozen(definition.drag)).toBe(true);
		expect(definition.drag).toMatchObject({ threshold: 5, axis: 'x' });
	});

	it('rejects invalid timing policy and ships stable presets', () => {
		expect(() => defineGesture({ press: { delay: -1 } })).toThrow('delay');
		expect(() => defineGesture({ drag: { threshold: Number.NaN } })).toThrow('threshold');
		expect(draggable).toBe(draggable);
		expect(longPress.press?.delay).toBe(500);
		expect(pressable.press).toBeDefined();
	});
});
