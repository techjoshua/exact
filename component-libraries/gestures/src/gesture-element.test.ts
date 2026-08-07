/**
 * @vitest-environment jsdom
 */
import { render, unmount } from '@exactjs/dom';
import { createTestVNode as createVNode } from '@exactjs/testing/internal/fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineGesture } from './definitions.js';
import { GestureElement } from './gesture-element.js';
import { createGestureTestClock, installGestureClock } from './testing.js';

const containers: Element[] = [];

afterEach(() => {
	for (const container of containers.splice(0)) unmount(container);
});

describe('GestureElement', () => {
	it('arbitrates press and drag at the configured threshold with normalized samples', async () => {
		const clock = createGestureTestClock();
		const restore = installGestureClock(clock);
		const phases: string[] = [];
		const press = vi.fn();
		const container = document.createElement('div');
		containers.push(container);
		try {
			render(
				createVNode(
					GestureElement,
					{
						apply: defineGesture({
							semantics: 'decorative',
							press: { threshold: 4, onPress: press },
							drag: {
								threshold: 4,
								lockDirection: true,
								onStart: (sample) => phases.push(`${sample.phase}:${sample.pointerType}`),
								onMove: (sample) =>
									phases.push(`${sample.phase}:${sample.delta.x},${sample.delta.y}`),
								onEnd: (sample) => phases.push(sample.phase)
							},
							touchAction: 'none'
						})
					},
					createVNode('button', null, 'Drag')
				),
				container
			);
			const target = container.querySelector('button')!;
			Object.assign(target, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
			target.dispatchEvent(pointer('pointerdown', 1, 0, 0));
			clock.advance(10);
			target.dispatchEvent(pointer('pointermove', 1, 2, 1));
			clock.advance(10);
			target.dispatchEvent(pointer('pointermove', 1, 8, 2));
			clock.advance(10);
			target.dispatchEvent(pointer('pointerup', 1, 8, 2));
			await settle();

			expect(phases).toEqual(['start:mouse', 'move:8,0', 'end']);
			expect(press).not.toHaveBeenCalled();
			expect(target.style.touchAction).toBe('none');
			expect(target.style.userSelect).toBe('');
		} finally {
			restore();
		}
	});

	it('supports keyboard parity and cancels active input on disposal', async () => {
		const moves: Array<{ x: number; y: number }> = [];
		const cancelled = vi.fn();
		const container = document.createElement('div');
		containers.push(container);
		render(
			createVNode(
				GestureElement,
				{
					apply: defineGesture({
						semantics: 'control',
						drag: { threshold: 0, onCancel: cancelled },
						keyboard: { step: 6, onMove: (sample) => moves.push(sample.delta) }
					})
				},
				createVNode('button', null, 'Move')
			),
			container
		);
		const target = container.querySelector('button')!;
		target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		target.dispatchEvent(pointer('pointerdown', 3, 0, 0));
		target.dispatchEvent(pointer('pointermove', 3, 2, 0));
		unmount(container);
		await settle();

		expect(moves).toEqual([{ x: 6, y: 0 }]);
		expect(cancelled).toHaveBeenCalledTimes(1);
	});

	it('coalesces slow moves to the latest sample and allows explicit simultaneous recognizers', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const dragMoves: number[] = [];
		const panMoves: number[] = [];
		const container = document.createElement('div');
		containers.push(container);
		render(
			createVNode(
				GestureElement,
				{
					apply: defineGesture({
						semantics: 'decorative',
						drag: {
							threshold: 0,
							priority: 2,
							simultaneous: true,
							onMove: async (sample) => {
								dragMoves.push(sample.delta.x);
								if (dragMoves.length === 1) await gate;
							}
						},
						pan: {
							threshold: 0,
							simultaneous: true,
							onMove: (sample) => panMoves.push(sample.delta.x)
						}
					})
				},
				createVNode('div', null, 'Surface')
			),
			container
		);
		const target = container.querySelector('div')!;
		target.dispatchEvent(pointer('pointerdown', 1, 0, 0));
		target.dispatchEvent(pointer('pointermove', 1, 2, 0));
		target.dispatchEvent(pointer('pointermove', 1, 5, 0));
		target.dispatchEvent(pointer('pointermove', 1, 9, 0));
		expect(dragMoves).toEqual([2]);
		expect(panMoves).toEqual([2]);

		release();
		await vi.waitFor(() => {
			expect(dragMoves).toEqual([2, 9]);
			expect(panMoves).toEqual([2, 9]);
		});
		target.dispatchEvent(pointer('pointerup', 1, 9, 0));
	});

	it('normalizes focus hover intent and completes one two-pointer pinch', async () => {
		const hover: string[] = [];
		const pinch: Array<{ phase: string; scale: number }> = [];
		const container = document.createElement('div');
		containers.push(container);
		render(
			createVNode(
				GestureElement,
				{
					apply: defineGesture({
						semantics: 'decorative',
						hover: {
							onStart: (sample) => hover.push(`start:${sample.pointerType}`),
							onEnd: (sample) => hover.push(`end:${sample.pointerType}`)
						},
						pinch: {
							threshold: 0,
							onStart: (sample) => pinch.push({ phase: sample.phase, scale: sample.scale }),
							onMove: (sample) => pinch.push({ phase: sample.phase, scale: sample.scale }),
							onEnd: (sample) => pinch.push({ phase: sample.phase, scale: sample.scale })
						}
					})
				},
				createVNode('div', { tabIndex: 0 }, 'Surface')
			),
			container
		);
		const target = container.querySelector('div')!;
		target.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		target.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
		target.dispatchEvent(pointer('pointerdown', 1, 0, 0, 'touch'));
		target.dispatchEvent(pointer('pointerdown', 2, 10, 0, 'touch'));
		target.dispatchEvent(pointer('pointermove', 2, 20, 0, 'touch'));
		target.dispatchEvent(pointer('pointerup', 2, 20, 0, 'touch'));
		target.dispatchEvent(pointer('pointerup', 1, 0, 0, 'touch'));
		await settle();

		expect(hover).toEqual(['start:keyboard', 'end:keyboard']);
		expect(pinch.map((sample) => sample.phase)).toEqual(['start', 'move', 'end']);
		expect(pinch[1]?.scale).toBe(2);
	});

	it('routes nested targets by logical priority and prefers the nearest target on ties', async () => {
		const calls: string[] = [];
		const container = document.createElement('div');
		containers.push(container);
		const definition = (name: string, priority: number) =>
			defineGesture({
				semantics: 'decorative',
				drag: {
					threshold: 0,
					priority,
					onMove: () => calls.push(name)
				}
			});
		const tree = (outerPriority: number) =>
			createVNode(
				GestureElement,
				{ apply: definition('outer', outerPriority) },
				createVNode(
					'div',
					null,
					createVNode(
						GestureElement,
						{ apply: definition('inner', 1) },
						createVNode('button', null, 'Nested')
					)
				)
			);

		render(tree(2), container);
		let target = container.querySelector('button')!;
		target.dispatchEvent(pointer('pointerdown', 1, 0, 0));
		target.dispatchEvent(pointer('pointermove', 1, 4, 0));
		target.dispatchEvent(pointer('pointerup', 1, 4, 0));
		await settle();
		expect(calls).toEqual(['outer']);

		calls.length = 0;
		unmount(container);
		const tieContainer = document.createElement('div');
		containers.push(tieContainer);
		render(tree(1), tieContainer);
		target = tieContainer.querySelector('button')!;
		target.dispatchEvent(pointer('pointerdown', 2, 0, 0));
		target.dispatchEvent(pointer('pointermove', 2, 4, 0));
		target.dispatchEvent(pointer('pointerup', 2, 4, 0));
		await settle();
		expect(calls).toEqual(['inner']);
	});

	it('delivers loser cancellation before the winner and provides keyboard fallbacks', async () => {
		const calls: string[] = [];
		const container = document.createElement('div');
		containers.push(container);
		render(
			createVNode(
				GestureElement,
				{
					apply: defineGesture({
						semantics: 'control',
						press: {
							onPress: (sample) => calls.push(`press:${sample.pointerType}`),
							onCancel: () => calls.push('press:cancel')
						},
						drag: {
							threshold: 0,
							priority: 2,
							onStart: () => calls.push('drag:start'),
							onMove: (sample) => calls.push(`drag:${sample.pointerType}`)
						},
						pan: {
							threshold: 0,
							priority: 1,
							onCancel: () => calls.push('pan:cancel')
						},
						keyboard: { step: 5 }
					})
				},
				createVNode('button', null, 'Control')
			),
			container
		);
		const target = container.querySelector('button')!;
		target.dispatchEvent(pointer('pointerdown', 1, 0, 0));
		target.dispatchEvent(pointer('pointermove', 1, 4, 0));
		target.dispatchEvent(pointer('pointerup', 1, 4, 0));
		target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await settle();

		expect(calls).toEqual([
			'pan:cancel',
			'press:cancel',
			'drag:start',
			'drag:mouse',
			'drag:keyboard',
			'press:keyboard'
		]);
	});

	it('allows only the highest-priority recognizer in an explicit exclusive group', async () => {
		const calls: string[] = [];
		const container = document.createElement('div');
		containers.push(container);
		render(
			createVNode(
				GestureElement,
				{
					apply: defineGesture({
						semantics: 'decorative',
						drag: {
							threshold: 0,
							priority: 2,
							exclusiveGroup: 'movement',
							simultaneous: true,
							onMove: () => calls.push('drag')
						},
						pan: {
							threshold: 0,
							priority: 1,
							exclusiveGroup: 'movement',
							simultaneous: true,
							onMove: () => calls.push('pan')
						}
					})
				},
				createVNode('div', null)
			),
			container
		);
		const target = container.querySelector('div')!;
		target.dispatchEvent(pointer('pointerdown', 1, 0, 0));
		target.dispatchEvent(pointer('pointermove', 1, 1, 0));
		target.dispatchEvent(pointer('pointerup', 1, 1, 0));
		await settle();
		expect(calls).toEqual(['drag']);
	});
});

function pointer(
	type: string,
	pointerId: number,
	clientX: number,
	clientY: number,
	pointerType = 'mouse'
): Event {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperties(event, {
		pointerId: { value: pointerId },
		pointerType: { value: pointerType },
		clientX: { value: clientX },
		clientY: { value: clientY }
	});
	return event;
}

async function settle(): Promise<void> {
	for (let index = 0; index < 8; index++) await Promise.resolve();
}
