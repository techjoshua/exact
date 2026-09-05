/**
 * @vitest-environment jsdom
 */
import { render, unmount } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { createTestOperation as createOperation } from '@exactjs/testing/internal/fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMotionDriver } from './driver.js';
import { fade } from './presets.js';
import { createMotionTestDriver } from './testing.js';
import {
	DuplicateMotionListView,
	FocusPresenceView,
	LayoutMotionListView,
	MotionListIdentityView,
	PoppingMotionListView,
	PresenceKeyedView,
	focusPresenceViewInstance,
	layoutMotionListViewInstance,
	motionListIdentityViewInstance,
	poppingMotionListViewInstance,
	presenceKeyedViewInstance
} from './presence-list.fixtures.js';

const containers: Element[] = [];

afterEach(() => {
	for (const container of containers.splice(0)) {
		unmount(container);
		container.remove();
	}
});

describe('Presence and MotionList', () => {
	it('waits for keyed exits before mounting an out-in replacement', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		try {
			render(createOperation(PresenceKeyedView, { mode: 'out-in' }), container);
			const owner = presenceKeyedViewInstance();
			const first = container.querySelector('button')!;

			owner.state.key = 'b';
			flushSync();
			await settle();

			expect(container.textContent).toBe('a');
			expect(container.querySelector('button')).toBe(first);
			expect(driver.playbacks).toHaveLength(1);

			driver.finishAll();
			await vi.waitFor(() => {
				flushSync();
				expect(container.textContent).toBe('b');
			});
			expect(container.querySelector('button')).not.toBe(first);
			expect(driver.playbacks).toHaveLength(2);
			expect(driver.playbacks[1]?.element.textContent).toBe('b');
		} finally {
			restore();
		}
	});

	it('mounts an in-out replacement before releasing the previous keyed range', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		try {
			render(createOperation(PresenceKeyedView, { mode: 'in-out' }), container);
			const owner = presenceKeyedViewInstance();
			const first = container.querySelector('button')!;

			owner.state.key = 'b';
			flushSync();
			const current = [...container.querySelectorAll('button')];
			expect(current.map((item) => item.textContent)).toEqual(['b', 'a']);
			const replacement = current[0]!;

			await settle();
			flushSync();

			expect(driver.playbacks).toHaveLength(1);
			expect(driver.playbacks[0]?.element).toBe(replacement);
			expect(first.inert).not.toBe(true);

			driver.playbacks[0]?.finish();
			await vi.waitFor(() => {
				flushSync();
				expect(driver.playbacks).toHaveLength(2);
			});
			expect(driver.playbacks[1]?.element).toBe(first);
			expect(first.inert).toBe(true);
		} finally {
			restore();
		}
	});

	it('advances in-out replacement immediately when reduced motion skips enter', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		try {
			render(createOperation(PresenceKeyedView, { mode: 'in-out', reduced: true }), container);
			const owner = presenceKeyedViewInstance();
			owner.state.key = 'b';
			flushSync();
			await vi.waitFor(() => {
				flushSync();
				expect(container.textContent).toBe('b');
			});
			expect(driver.playbacks).toHaveLength(0);
		} finally {
			restore();
		}
	});

	it('makes a leaving target inert, returns focus, and reverses the same DOM generation', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		try {
			render(createOperation(FocusPresenceView, null), container);
			const owner = focusPresenceViewInstance();
			const target = [...container.querySelectorAll('button')][1]!;
			target.focus();

			owner.state.shown = false;
			flushSync();
			await settle();
			expect(driver.playbacks).toHaveLength(1);
			expect(driver.playbacks[0]?.element).toBe(target);
			expect(driver.playbacks[0]?.signal.aborted).toBe(false);
			expect(target.isConnected).toBe(true);
			expect(target.inert).toBe(true);
			expect(target.style.pointerEvents).toBe('none');
			expect(document.activeElement).toBe(container.querySelector('button'));

			owner.state.shown = true;
			flushSync();
			await settle();
			expect([...container.querySelectorAll('button')][1]).toBe(target);
			expect(target.inert).toBe(false);
			expect(target.style.pointerEvents).toBe('');
			expect(driver.playbacks[0]?.signal.aborted).toBe(true);
			expect(driver.playbacks).toHaveLength(2);
			expect(driver.playbacks[1]?.element).toBe(target);
			expect(driver.playbacks[1]?.effect.keyframes).toEqual(
				(fade.enter as { keyframes: Keyframe[] }).keyframes
			);
		} finally {
			restore();
		}
	});

	it('preserves keyed DOM identity across reorder and rejects duplicate keys', () => {
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		render(createOperation(MotionListIdentityView, null), container);
		const owner = motionListIdentityViewInstance();
		const first = container.querySelector('li');

		owner.state.items.reverse();
		flushSync();
		expect([...container.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
			'b',
			'a'
		]);
		expect(container.querySelectorAll('li')[1]).toBe(first);

		const duplicateContainer = document.createElement('div');
		document.body.append(duplicateContainer);
		containers.push(duplicateContainer);
		let duplicateError: unknown;
		render(createOperation(DuplicateMotionListView, null), duplicateContainer, {
			onErrorReport(report) {
				duplicateError = report.error;
			}
		});
		expect(duplicateError).toBeInstanceOf(Error);
		expect((duplicateError as Error).message).toContain('Duplicate key "a"');
	});

	it('measures keyed reorders inside a LayoutGroup and plays additive FLIP motion', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		try {
			render(createOperation(LayoutMotionListView, null), container);
			const owner = layoutMotionListViewInstance();
			const elements = [...container.querySelectorAll('li')];
			for (const element of elements) {
				vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => {
					const top = [...container.querySelectorAll('li')].indexOf(element) * 40;
					return rect(top);
				});
			}

			owner.state.items.reverse();
			flushSync();
			await settle();

			expect(driver.playbacks).toHaveLength(2);
			expect(driver.playbacks.map((playback) => playback.element.textContent).sort()).toEqual([
				'a',
				'b'
			]);
			for (const playback of driver.playbacks) {
				const first = (playback.effect.keyframes as Keyframe[])[0]!;
				expect(first.composite).toBe('add');
				expect(first.transform).toMatch(/translate\(0px, (-40|40)px\)/);
			}
		} finally {
			restore();
		}
	});

	it('pops a leaving list item out of layout and restores it on reinsertion', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		try {
			render(createOperation(PoppingMotionListView, null), container);
			const owner = poppingMotionListViewInstance();
			const target = container.querySelector('li')!;
			vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect(24));

			owner.state.items.splice(0, 1);
			flushSync();
			await settle();
			expect(driver.playbacks).toHaveLength(1);
			expect(driver.playbacks[0]?.element).toBe(target);
			expect(driver.playbacks[0]?.signal.aborted).toBe(false);
			expect(target.isConnected).toBe(true);
			expect(target.inert).toBe(true);
			expect(target.style.position).toBe('fixed');
			expect(target.style.top).toBe('24px');

			owner.state.items.push({ id: 'a' });
			flushSync();
			await settle();
			expect(container.querySelector('li')).toBe(target);
			expect(target.style.position).toBe('');
			expect(target.style.top).toBe('');
			expect(driver.playbacks[0]?.signal.aborted).toBe(true);
		} finally {
			restore();
		}
	});
});

async function settle(): Promise<void> {
	for (let index = 0; index < 8; index++) await Promise.resolve();
}

function rect(top: number): DOMRect {
	return {
		x: 0,
		y: top,
		top,
		left: 0,
		right: 100,
		bottom: top + 20,
		width: 100,
		height: 20,
		toJSON: () => ({})
	};
}
