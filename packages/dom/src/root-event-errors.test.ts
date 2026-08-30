/**
 * @vitest-environment jsdom
 */
import { type ErrorContextValue } from '@exactjs/core';
import { jsx } from './test-support/native-operations.js';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { renderTestTree as render } from './testing.js';
import {
	FirstErrorRoot,
	RootErrorPanel,
	SecondErrorRoot,
	isolatedRootErrorContexts,
	rootErrorContext
} from './test-support/roots/root-event-errors.fixtures.js';

describe('@exactjs/dom root event errors', () => {
	it('renders the root default error view for unclaimed event failures', () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		let errors: ErrorContextValue | undefined;
		try {
			const container = document.createElement('div');
			render(jsx(RootErrorPanel, {}), container);
			errors = rootErrorContext();
			container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			flushSync();

			expect(errors.errors).toHaveLength(1);
			expect(container.textContent).toContain('Application error');
			expect(container.textContent).toContain('root failed');
		} finally {
			errors?.clearAll();
			errorLog.mockRestore();
		}
	});

	it('keeps root default error contexts isolated per container', () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		let firstErrors: ErrorContextValue | undefined;
		let secondErrors: ErrorContextValue | undefined;
		try {
			const first = document.createElement('div');
			const second = document.createElement('div');
			render(jsx(FirstErrorRoot, {}), first);
			render(jsx(SecondErrorRoot, {}), second);
			[firstErrors, secondErrors] = isolatedRootErrorContexts();

			first.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			flushSync();

			expect(firstErrors).not.toBe(secondErrors);
			expect(firstErrors.errors).toHaveLength(1);
			expect(secondErrors.errors).toHaveLength(0);
			expect(first.textContent).toContain('first failed');
			expect(second.textContent).toBe('Second ok');
		} finally {
			firstErrors?.clearAll();
			secondErrors?.clearAll();
			errorLog.mockRestore();
		}
	});
});
