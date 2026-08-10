import { unwrap, type StopHandle } from '@exactjs/core';
import type { EffectScope } from '@exactjs/reactive';
import { watchRetained } from '@exactjs/reactive/framework/watch';

/**
 * Reconciles one compiler-owned modal binding through the native dialog methods.
 * Stopping the binding releases observation without changing the dialog's live state.
 */
export function bindModalOpen(
	element: Element,
	source: unknown,
	scope: EffectScope,
	onRelease: () => void
): StopHandle | undefined {
	const dialog = asDialog(element);
	return watchRetained(() => reconcileModalOpen(dialog, unwrap(source) === true), undefined, {
		scope,
		onRelease
	});
}

/** Returns whether a native dialog currently participates in the modal top layer. */
export function isModalDialog(element: Element): boolean {
	return element.localName === 'dialog' && element.matches(':modal');
}

function reconcileModalOpen(dialog: HTMLDialogElement, desired: boolean): void {
	const modal = dialog.matches(':modal');
	if (modal === desired) return;
	if (dialog.open && !modal) {
		throw new Error(
			'modal:isOpen cannot take ownership of a dialog that is already open nonmodally'
		);
	}
	if (desired) dialog.showModal();
	else dialog.close();
}

function asDialog(element: Element): HTMLDialogElement {
	if (
		element.localName !== 'dialog' ||
		typeof (element as HTMLDialogElement).showModal !== 'function' ||
		typeof (element as HTMLDialogElement).close !== 'function'
	)
		throw new TypeError('modal:isOpen requires a native dialog element');
	return element as HTMLDialogElement;
}
