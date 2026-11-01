import { expect, it } from 'vitest';
import { createPointerGestureSample } from './gesture-samples.js';
import { defineDrag, defineGesture } from './definitions.js';
import type { DragRecognizerInput } from './contracts.js';

it('keeps prepared recognizers and definitions ordinary under writable aliases', () => {
	const drag = defineDrag({ threshold: 5 });
	const definition = defineGesture({ semantics: 'decorative', drag });
	const alias: { drag?: DragRecognizerInput } = definition;
	alias.drag = { threshold: 7 };
	expect(definition.drag?.threshold).toBe(7);
	const recognizer: { threshold?: number } = drag;
	recognizer.threshold = 9;
	expect(drag.threshold).toBe(9);
});

it('publishes ordinary coordinates without freezing or exposing the private pointer record', () => {
	const point = { x: 12, y: 8 };
	const pointer = { origin: { x: 0, y: 0 }, last: point, time: 0, pointerType: 'mouse' };
	const sample = createPointerGestureSample({
		phase: 'move',
		point,
		pointer,
		event: new Event('pointermove'),
		startedAt: 0,
		now: () => 16,
		signal: new AbortController().signal
	});
	const coordinate: { x: number; y: number } = sample.point;
	coordinate.x = 300;
	point.y = 20;
	expect(sample.point).toEqual({ x: 300, y: 8 });
	expect(pointer.last).toEqual({ x: 12, y: 20 });
});

it('validates and publishes one captured recognizer value', () => {
	let reads = 0;
	const recognizer = defineDrag({
		get threshold() {
			return ++reads === 1 ? 5 : NaN;
		}
	});
	expect(reads).toBe(1);
	expect(recognizer.threshold).toBe(5);
});
