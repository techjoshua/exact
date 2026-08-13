/**
 * @vitest-environment jsdom
 */
import { createExpression, type Component } from '@exactjs/core';
import { createEffectScope, flushSync } from '@exactjs/reactive';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, unmount } from './index.js';
import './runtime/modal.js';
import { bindModalOpen } from './modal-binding.js';
import { createCompiledVNode, jsx } from './test-support/native-vnode.js';

const modalDialogs = new WeakSet<HTMLDialogElement>();
const restorations: Array<() => void> = [];

afterEach(() => {
	for (const restore of restorations.splice(0).reverse()) restore();
});

describe('@exactjs/dom modal binding', () => {
	it('uses native modal methods and publishes native closure back to state', () => {
		installDialogPlatform();
		let instance!: Component<{ open: boolean }>;
		function Modal(this: Component<{ open: boolean }>) {
			instance = this;
			this.state.open = true;
			return () =>
				createCompiledVNode('dialog', {
					__exactModalOpen: createExpression(() => this.state.open),
					__exactBindModalToggle: publishModalState(this),
					__exactBindModalClose: publishModalState(this)
				});
		}

		const container = document.createElement('div');
		render(jsx(Modal, {}), container);
		const dialog = container.querySelector('dialog')!;
		expect(dialog.matches(':modal')).toBe(true);

		dialog.close();
		flushSync();
		expect(instance.state.open).toBe(false);

		instance.state.open = true;
		flushSync();
		expect(dialog.matches(':modal')).toBe(true);

		unmount(container);
		expect(dialog.matches(':modal')).toBe(true);
	});

	it('refuses to convert an independently opened nonmodal dialog', () => {
		installDialogPlatform();
		const dialog = document.createElement('dialog');
		dialog.open = true;
		const errors: unknown[] = [];
		const scope = createEffectScope(undefined, (error) => errors.push(error));

		bindModalOpen(
			dialog,
			createExpression(() => true),
			scope,
			() => undefined
		);
		expect(errors.map(String)).toEqual([expect.stringMatching(/already open nonmodally/)]);
	});
});

function publishModalState(component: Component<{ open: boolean }>): (event: Event) => void {
	return (event) => {
		component.state.open = (event.currentTarget as HTMLDialogElement).matches(':modal');
	};
}

function installDialogPlatform(): void {
	const prototype = HTMLDialogElement.prototype;
	const nativeMatches = Element.prototype.matches;
	const showModal = Object.getOwnPropertyDescriptor(prototype, 'showModal');
	const close = Object.getOwnPropertyDescriptor(prototype, 'close');
	Object.defineProperty(prototype, 'showModal', {
		configurable: true,
		value(this: HTMLDialogElement) {
			if (this.open) throw new DOMException('Dialog is already open', 'InvalidStateError');
			this.open = true;
			modalDialogs.add(this);
			this.dispatchEvent(new Event('toggle'));
		}
	});
	Object.defineProperty(prototype, 'close', {
		configurable: true,
		value(this: HTMLDialogElement) {
			if (!this.open) return;
			this.open = false;
			modalDialogs.delete(this);
			this.dispatchEvent(new Event('toggle'));
			this.dispatchEvent(new Event('close'));
		}
	});
	const matches = vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
		this: Element,
		selector: string
	) {
		if (selector === ':modal') return this instanceof HTMLDialogElement && modalDialogs.has(this);
		return nativeMatches.call(this, selector);
	});
	restorations.push(() => {
		matches.mockRestore();
		restoreDescriptor(prototype, 'showModal', showModal);
		restoreDescriptor(prototype, 'close', close);
	});
}

function restoreDescriptor(
	target: object,
	key: PropertyKey,
	descriptor: PropertyDescriptor | undefined
): void {
	if (descriptor) Object.defineProperty(target, key, descriptor);
	else Reflect.deleteProperty(target, key);
}
