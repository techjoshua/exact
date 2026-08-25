/**
 * @vitest-environment jsdom
 */
import { ErrorContext, type Component, type ErrorContextValue } from '@exactjs/core';
import { jsx } from './test-support/native-vnode.js';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { render } from './index.js';

describe('@exactjs/dom root event errors', () => {
	it('renders the root default error view for unclaimed event failures', () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		let errors!: ErrorContextValue;

		function Panel(this: Component<{}>) {
			errors = this.getContext(ErrorContext);
			return () =>
				jsx('button', {
					onClick: () => {
						throw new Error('root failed');
					},
					children: 'Break'
				});
		}

		try {
			const container = document.createElement('div');
			render(jsx(Panel, {}), container);
			container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			flushSync();

			expect(errors.errors).toHaveLength(1);
			expect(container.textContent).toContain('Application error');
			expect(container.textContent).toContain('root failed');
		} finally {
			errors.clearAll();
			errorLog.mockRestore();
		}
	});

	it('keeps root default error contexts isolated per container', () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		let firstErrors!: ErrorContextValue;
		let secondErrors!: ErrorContextValue;

		function First(this: Component<{}>) {
			firstErrors = this.getContext(ErrorContext);
			return () =>
				jsx('button', {
					onClick: () => {
						throw new Error('first failed');
					},
					children: 'First'
				});
		}

		function Second(this: Component<{}>) {
			secondErrors = this.getContext(ErrorContext);
			return () => jsx('p', { children: 'Second ok' });
		}

		try {
			const first = document.createElement('div');
			const second = document.createElement('div');
			render(jsx(First, {}), first);
			render(jsx(Second, {}), second);

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
