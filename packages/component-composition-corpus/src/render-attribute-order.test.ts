import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { expect, it, vi } from 'vitest';
import {
	attributeOrderOwner,
	attributeOrderRoot
} from './test-support/render-attribute-order.fixtures.js';
import { attributeOrderRoot as serverRoot } from './test-support/render-attribute-order.fixtures.js?exact-target=server';

it.each(['mount', 'hydrate'] as const)(
	'preserves literal and spread precedence during %s and retained updates',
	async (mode) => {
		const container = document.createElement('div');
		const reports: unknown[] = [];
		try {
			if (mode === 'hydrate') {
				const rendered = await renderToHydratableString(serverRoot());
				container.innerHTML = rendered.html;
				const serverElement = container.querySelector('[data-attribute-spread]');
				hydrate(attributeOrderRoot(), container, {
					resumptions: rendered.resumptions,
					onMismatch: 'throw',
					onErrorReport: (report) => reports.push(report.error)
				});
				expect(container.querySelector('[data-attribute-spread]')).toBe(serverElement);
			} else
				render(attributeOrderRoot(), container, {
					onErrorReport: (report) => reports.push(report.error)
				});
			expect(reports).toEqual([]);
			const ariaControl = container.querySelector('[data-aria-state]')!;
			expect(ariaControl.getAttribute('aria-pressed')).toBe('false');
			expect(ariaControl.getAttribute('aria-expanded')).toBe('false');
			expect(ariaControl.hasAttribute('data-selected')).toBe(false);
			const [fixed, spread] = Array.from(container.querySelectorAll('div'));
			expect(fixed?.title).toBe('fixed');
			expect(fixed?.id).toBe('fixed-id');
			expect(spread?.title).toBe('spread');
			const [fixedInput, spreadInput] = Array.from(container.querySelectorAll('input'));
			expect(fixedInput.required).toBe(true);
			expect(fixedInput.maxLength).toBe(4);
			expect(fixedInput.className).toBe('fixed');
			expect(spreadInput.required).toBe(false);
			expect(reports).toEqual([]);
			expect(spreadInput.maxLength).toBe(2);
			expect(spreadInput.className).toBe('spread');
			expect(container.querySelector('output[title]')?.getAttribute('title')).toBe('spread');
			for (const textarea of container.querySelectorAll('textarea'))
				expect(textarea.defaultValue).toContain('title="spread"');
			const textControl = container.querySelector('textarea')!;
			textControl.value = 'typed';
			attributeOrderOwner.state.bag = { title: 'updated' };
			attributeOrderOwner.state.inputBag = {};
			flushSync();
			expect(spread?.title).toBe('updated');
			expect(container.querySelector('[data-aria-state]')).toBe(ariaControl);
			expect(ariaControl.getAttribute('aria-pressed')).toBe('true');
			expect(ariaControl.getAttribute('aria-expanded')).toBe('true');
			expect(ariaControl.getAttribute('data-selected')).toBe('true');
			attributeOrderOwner.state.bag = { title: 'spread', id: 'spread-id' };
			attributeOrderOwner.state.inputBag = { required: false, maxLength: 2, className: 'spread' };
			flushSync();
			(container.querySelector('[data-attribute-step]') as HTMLButtonElement).click();
			await Promise.resolve();
			expect(attributeOrderOwner.state.bag.title).toBe('updated');
			flushSync();
			expect(container.querySelector('div')).toBe(fixed);
			expect(fixed?.title).toBe('fixed');
			expect(fixed?.id).toBe('fixed-id');
			expect(spread?.title).toBe('updated');
			expect(spread?.id).toBe('fixed-id');
			expect(spreadInput.required).toBe(true);
			expect(spreadInput.maxLength).toBe(4);
			expect(spreadInput.className).toBe('fixed');
			expect(container.querySelector('output[title]')?.getAttribute('title')).toBe('updated');
			for (const textarea of container.querySelectorAll('textarea'))
				expect(textarea.defaultValue).toContain('title="updated"');
			attributeOrderOwner.state.bag = { title: 'restored', id: 'restored-id' };
			attributeOrderOwner.state.inputBag = { required: false, maxLength: 2, className: 'spread' };
			flushSync();
			expect(fixed?.title).toBe('fixed');
			expect(spread?.title).toBe('restored');
			expect(ariaControl.getAttribute('aria-pressed')).toBe('false');
			expect(ariaControl.getAttribute('aria-expanded')).toBe('false');
			expect(ariaControl.hasAttribute('data-selected')).toBe(false);
			expect(spread?.id).toBe('restored-id');
			for (const textarea of container.querySelectorAll('textarea'))
				expect(textarea.defaultValue).toContain('title="restored"');
			expect(container.querySelector('input')).toBe(fixedInput);
			expect(fixedInput.required).toBe(true);
			expect(spreadInput.required).toBe(false);
			expect(reports).toEqual([]);
			(container.querySelector('[data-generation-step]') as HTMLButtonElement).click();
			await vi.waitFor(() =>
				expect(container.querySelector('[data-generation-state]')?.textContent).toBe('published')
			);
			expect(textControl.value).toBe('typed');
			unmount(container);
			attributeOrderOwner.state.bag = { title: 'disposed' };
			flushSync();
			expect(spread?.title).toBe('restored');
			expect(container.childNodes.length).toBe(0);
			expect(reports).toEqual([]);
		} finally {
			unmount(container);
		}
	}
);
