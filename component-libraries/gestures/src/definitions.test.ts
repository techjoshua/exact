import { describe, expect, it } from 'vitest';
import type { GestureDefinitionInput } from './contracts.js';
import { defineDrag, defineGesture, isGestureDefinition } from './definitions.js';
import { draggable, longPress, pressable } from './presets.js';

describe('gesture definitions', () => {
	it('prepares immutable reusable definitions and recognizers', () => {
		const drag = defineDrag({ threshold: 5, axis: 'x' });
		const definition = defineGesture({ name: 'card', semantics: 'decorative', drag });
		expect(isGestureDefinition(definition)).toBe(true);
		expect(Object.isFrozen(definition)).toBe(true);
		expect(Object.isFrozen(definition.drag)).toBe(true);
		expect(definition.drag).toMatchObject({ threshold: 5, axis: 'x' });
	});

	it('rejects invalid timing policy and ships stable presets', () => {
		// @ts-expect-error Control-like definitions require an explicit keyboard path.
		const pointerOnlyControl: GestureDefinitionInput = { semantics: 'control', press: {} };
		expect(() => defineGesture(pointerOnlyControl)).toThrow('keyboard policy');
		expect(() => defineGesture({ semantics: 'decorative', press: { delay: -1 } })).toThrow('delay');
		expect(() =>
			defineGesture({ semantics: 'decorative', drag: { threshold: Number.NaN } })
		).toThrow('threshold');
		expect(draggable).toBe(draggable);
		expect(longPress.press?.delay).toBe(500);
		expect(pressable.press).toBeDefined();
	});
});
