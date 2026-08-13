import { vi } from 'vitest';

const modalDialogs = new WeakSet<HTMLDialogElement>();

/** Installs the native dialog subset missing from jsdom and returns its restoration callback. */
export function installDialogPlatform(): () => void {
	const prototype = HTMLDialogElement.prototype;
	const nativeMatches = Element.prototype.matches;
	const showModal = Object.getOwnPropertyDescriptor(prototype, 'showModal');
	const close = Object.getOwnPropertyDescriptor(prototype, 'close');
	Object.defineProperty(prototype, 'showModal', {
		configurable: true,
		value(this: HTMLDialogElement) {
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
	return () => {
		matches.mockRestore();
		restoreDescriptor(prototype, 'showModal', showModal);
		restoreDescriptor(prototype, 'close', close);
	};
}

function restoreDescriptor(
	target: object,
	key: PropertyKey,
	descriptor: PropertyDescriptor | undefined
): void {
	if (descriptor) Object.defineProperty(target, key, descriptor);
	else Reflect.deleteProperty(target, key);
}
