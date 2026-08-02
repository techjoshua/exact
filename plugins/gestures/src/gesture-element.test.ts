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
});

function pointer(type: string, pointerId: number, clientX: number, clientY: number): Event {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperties(event, {
		pointerId: { value: pointerId },
		pointerType: { value: 'mouse' },
		clientX: { value: clientX },
		clientY: { value: clientY }
	});
	return event;
}

async function settle(): Promise<void> {
	for (let index = 0; index < 8; index++) await Promise.resolve();
}
