// @vitest-environment jsdom
import { createPortal } from '@exactjs/core';
import { computed, flushSync, reactive } from '@exactjs/reactive';
import { expect, it, onTestFinished, vi } from 'vitest';
import { unmount } from './index.js';
import { renderTestTree as render } from './testing.js';
import { createOperation } from './test-support/native-operations.js';

it('delivers shared-target portal events only through the callback owner', () => {
	const first = document.createElement('main');
	const second = document.createElement('main');
	const target = document.createElement('aside');
	onTestFinished(() => {
		unmount(first);
		unmount(second);
	});
	const firstClick = vi.fn();
	const secondClick = vi.fn();
	render(
		createPortal(target, createOperation('button', { id: 'first', onClick: firstClick })),
		first
	);
	render(
		createPortal(target, createOperation('button', { id: 'second', onClick: secondClick })),
		second
	);
	target.querySelector<HTMLButtonElement>('#second')!.click();
	expect(secondClick).toHaveBeenCalledTimes(1);
	expect(firstClick).not.toHaveBeenCalled();
	target.querySelector<HTMLButtonElement>('#first')!.click();
	expect(firstClick).toHaveBeenCalledTimes(1);
	render(createOperation('div', null, 'retained root'), first);
	target.querySelector<HTMLButtonElement>('#second')!.click();
	expect(secondClick).toHaveBeenCalledTimes(2);
});

it('preserves native bubbling and repeated dispatch across nested renderer roots', () => {
	const outer = document.createElement('main');
	const parentClick = vi.fn();
	const childClick = vi.fn();
	const inner = document.createElement('div');
	onTestFinished(() => {
		unmount(inner);
		unmount(outer);
	});
	render(
		createOperation(
			'section',
			{ onClick: parentClick },
			createOperation('div', { id: 'inner-root' })
		),
		outer
	);
	const target = outer.querySelector('#inner-root')!;
	target.append(inner);
	render(createOperation('button', { onClick: childClick }), inner);
	const event = new MouseEvent('click', { bubbles: true });
	const button = inner.querySelector('button')!;
	button.dispatchEvent(event);
	button.dispatchEvent(event);
	expect(childClick).toHaveBeenCalledTimes(2);
	expect(parentClick).toHaveBeenCalledTimes(2);
});

it('dispatches nested portal callbacks once after their reactive handler changes', () => {
	const container = document.createElement('main');
	const target = document.createElement('aside');
	onTestFinished(() => {
		unmount(container);
	});
	const parentClick = vi.fn();
	const calls: number[] = [];
	const state = reactive({ version: 0 });
	const outer = createPortal(
		target,
		createOperation(
			'section',
			{ onClick: parentClick },
			createOperation('div', { id: 'inner-target' })
		)
	);
	render(outer, container);
	const inner = target.querySelector('#inner-target')!;
	const handler = computed(() => {
		const version = state.version;
		return () => calls.push(version);
	});
	render([outer, createPortal(inner, createOperation('button', { onClick: handler }))], container);
	inner.querySelector<HTMLButtonElement>('button')!.click();
	state.version = 1;
	flushSync();
	inner.querySelector<HTMLButtonElement>('button')!.click();
	expect(calls).toEqual([0, 1]);
	expect(parentClick).toHaveBeenCalledTimes(2);
});

it('releases a foreign target listener after its last portal leaves', () => {
	const container = document.createElement('main');
	const target = document.createElement('aside');
	const added = vi.spyOn(target, 'addEventListener');
	const removed = vi.spyOn(target, 'removeEventListener');
	onTestFinished(() => {
		unmount(container);
		added.mockRestore();
		removed.mockRestore();
	});
	const first = createPortal(target, createOperation('button', { id: 'first', onClick() {} }));
	const second = createPortal(target, createOperation('button', { id: 'second', onClick() {} }));
	render([first, second], container);
	const listener = added.mock.calls.find(([type]) => type === 'click')![1];
	render([second], container);
	expect(removed).not.toHaveBeenCalled();
	render(createOperation('div', null, 'root remains mounted'), container);
	expect(removed).toHaveBeenCalledWith('click', listener);
	expect(target.childNodes).toHaveLength(0);
});

it('releases the previous listener when a retained portal changes targets', () => {
	const container = document.createElement('main');
	const previous = document.createElement('aside');
	const current = document.createElement('aside');
	const removed = vi.spyOn(previous, 'removeEventListener');
	onTestFinished(() => {
		unmount(container);
		removed.mockRestore();
	});
	const click = vi.fn();
	render(createPortal(previous, createOperation('button', { onClick: click })), container);
	render(createPortal(current, createOperation('button', { onClick: click })), container);
	expect(previous.childNodes).toHaveLength(0);
	expect(removed.mock.calls.filter(([type]) => type === 'click')).toHaveLength(1);
	current.querySelector<HTMLButtonElement>('button')!.click();
	expect(click).toHaveBeenCalledTimes(1);
});

it('keeps root delegation after removing a portal inside that root', () => {
	const container = document.createElement('main');
	const removed = vi.spyOn(container, 'removeEventListener');
	onTestFinished(() => {
		unmount(container);
		removed.mockRestore();
	});
	const parentClick = vi.fn();
	const childClick = vi.fn();
	const section = createOperation(
		'section',
		{ onClick: parentClick },
		createOperation('aside', { id: 'target' })
	);
	render(section, container);
	const target = container.querySelector('#target')!;
	render(
		[section, createPortal(target, createOperation('button', { onClick: childClick }))],
		container
	);
	target.querySelector<HTMLButtonElement>('button')!.click();
	expect(childClick).toHaveBeenCalledTimes(1);
	expect(parentClick).toHaveBeenCalledTimes(1);
	render([section], container);
	container.querySelector('section')!.click();
	expect(parentClick).toHaveBeenCalledTimes(2);
	expect(removed).not.toHaveBeenCalled();
});

it('honors stopPropagation across nested renderer roots', () => {
	const container = document.createElement('main');
	const parentClick = vi.fn();
	const childClick = vi.fn((event: Event) => event.stopPropagation());
	const nested: { inner?: Element } = {};
	onTestFinished(() => {
		if (nested.inner) unmount(nested.inner);
		unmount(container);
	});
	render(
		createOperation('section', { onClick: parentClick }, createOperation('div', { id: 'inner' })),
		container
	);
	const inner = container.querySelector('#inner')!;
	nested.inner = inner;
	render(createOperation('button', { onClick: childClick }), inner);
	inner.querySelector<HTMLButtonElement>('button')!.click();
	expect(childClick).toHaveBeenCalledTimes(1);
	expect(parentClick).not.toHaveBeenCalled();
});

it('rolls back prepared portal children when replacement placement fails', () => {
	const container = document.createElement('main');
	const previous = document.createElement('aside');
	const invalid = document.implementation.createHTMLDocument('occupied target');
	let releases = 0;
	const ref = {
		fulfill(value: unknown) {
			if (value === undefined) releases++;
		}
	};
	const removed = vi.spyOn(invalid, 'removeEventListener');
	onTestFinished(() => {
		unmount(container);
		removed.mockRestore();
	});
	render(createPortal(previous, createOperation('button', { onClick() {} })), container);
	expect(() =>
		render(createPortal(invalid, createOperation('button', { ref, onClick() {} })), container)
	).toThrow();
	expect(releases).toBe(1);
	expect(removed.mock.calls.filter(([type]) => type === 'click')).toHaveLength(1);
	invalid.documentElement.remove();
	const click = vi.fn();
	render(createPortal(invalid, createOperation('button', { ref, onClick: click })), container);
	invalid.querySelector<HTMLButtonElement>('button')!.click();
	expect(click).toHaveBeenCalledTimes(1);
});
