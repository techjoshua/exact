import type { ErrorReport } from '@exactjs/core';
/** Shared compiled-fixture host for browser event ownership checks. */
export function verifyEventResponsibility(api: {
	mount(
		container: HTMLElement,
		action: 'selection' | 'blur' | 'focus' | 'atomic',
		fail: boolean,
		errors: ErrorReport[]
	): void;
	unmount(container: HTMLElement): void;
	flushSync(): void;
}): { scenarios: number };
