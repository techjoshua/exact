/**
 * @vitest-environment jsdom
 */
import { createErrorContext, type Child } from '@exactjs/core';
import { isExactComponent } from '@exactjs/core/framework/component-contracts';
import { render } from '@exactjs/dom';
import { createTestComponentReceipt } from '@exactjs/testing/internal/fixtures';
import { describe, expect, it, vi } from 'vitest';
import {
	ApplePage,
	BasenamePage,
	ErrorLinkApp,
	GeneratedLayout,
	GeneratedPage,
	HashPage,
	HomePage,
	MissingPage,
	NestedLayout,
	StatePage,
	TargetLinksPage,
	UserPage
} from './components.fixtures.js';
import { createMemoryLocationSource, Router } from './index.js';

const component = createTestComponentReceipt;

describe('router', () => {
	it('uses compiler identity for authored native fixtures', () => {
		expect(isExactComponent(NestedLayout)).toBe(true);
		expect(isExactComponent(Router)).toBe(true);
	});

	it('matches nested dynamic routes and navigates', async () => {
		const source = createMemoryLocationSource('https://example.test/');
		const container = document.createElement('div');
		render(
			component(Router, {
				source,
				routes: [
					{
						render: (outlet: Child) => component(NestedLayout, null, outlet),
						children: [
							{ index: true, render: () => component(HomePage, null) },
							{ path: 'users/:id', render: () => component(UserPage, null) }
						]
					}
				]
			}),
			container
		);
		expect(container.textContent).toBe('Open');
		container
			.querySelector('a')!
			.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
		expect(container.textContent).toBe('User 42');
		source.push(new URL('https://example.test/users/99'));
		await vi.waitFor(() => expect(container.textContent).toBe('User 99'));
	});

	it('normalizes basenames and generates hash links', () => {
		const source = createMemoryLocationSource('https://example.test/app/start');
		const container = document.createElement('div');
		render(
			component(Router, {
				source,
				basename: '/app',
				mode: 'hash',
				routes: [{ path: 'start', render: () => component(BasenamePage, null) }]
			}),
			container
		);
		expect(container.querySelector('a')?.getAttribute('href')).toBe('#/app/start');
		expect(container.querySelector('a')?.getAttribute('aria-current')).toBe('page');
	});

	it('matches explicit fragment-bearing hash sources for SSR parity', () => {
		const source = createMemoryLocationSource('https://example.test/#/app/start?from=ssr');
		const container = document.createElement('div');
		render(
			component(Router, {
				source,
				basename: '/app',
				mode: 'hash',
				routes: [{ path: 'start', render: () => component(HashPage, null) }]
			}),
			container
		);
		expect(container.querySelector('p')?.textContent).toBe('?from=ssr');
		expect(container.querySelector('a')?.getAttribute('href')).toBe('#/app/start?page=2');
	});

	it('collects routes generated inside compiled fragments', async () => {
		const generated = [
			{ path: 'guides/routing', render: () => component(GeneratedPage, null) },
			{ path: 'learn/state', render: () => component(StatePage, null) }
		];
		const source = createMemoryLocationSource('https://example.test/guides/routing');
		const container = document.createElement('div');
		render(
			component(Router, {
				source,
				routes: [
					{
						render: (outlet: Child) => component(GeneratedLayout, null, outlet),
						children: [...generated, { path: '*', render: () => component(MissingPage, null) }]
					}
				]
			}),
			container
		);
		expect(container.querySelector('p')?.textContent).toBe('Generated route');
		expect(container.querySelectorAll('a')[0]?.getAttribute('aria-current')).toBe('page');
		expect(container.querySelectorAll('a')[1]?.getAttribute('aria-current')).toBeNull();
		container.querySelectorAll('a')[1]!.click();
		expect(container.querySelector('p')?.textContent).toBe('State route');
		await vi.waitFor(() => {
			expect(container.querySelectorAll('a')[0]?.getAttribute('aria-current')).toBeNull();
			expect(container.querySelectorAll('a')[1]?.getAttribute('aria-current')).toBe('page');
		});
		container.querySelectorAll('a')[0]!.click();
		expect(source.location().pathname).toBe('/guides/routing');
		expect(container.querySelector('p')?.textContent).toBe('Generated route');
		await vi.waitFor(() => {
			expect(container.querySelectorAll('a')[0]?.getAttribute('aria-current')).toBe('page');
			expect(container.querySelectorAll('a')[1]?.getAttribute('aria-current')).toBeNull();
		});
	});

	it('keeps the current pathname for query and fragment targets', () => {
		const source = createMemoryLocationSource('https://example.test/users/42');
		const container = document.createElement('div');
		render(
			component(Router, {
				source,
				routes: [{ path: 'users/:id', render: () => component(TargetLinksPage, null) }]
			}),
			container
		);
		expect(
			Array.from(container.querySelectorAll('a'), (anchor) => anchor.getAttribute('href'))
		).toEqual(['/users/42?page=2', '/users/42#details']);
	});

	it('does not strip a basename from a partial segment', () => {
		const container = document.createElement('div');
		render(
			component(Router, {
				source: createMemoryLocationSource('https://example.test/apple'),
				basename: '/app',
				routes: [{ path: 'le', render: () => component(ApplePage, null) }]
			}),
			container
		);
		expect(container.textContent).toBe('');
	});

	it('observes rejected consumer link callbacks', async () => {
		const errors = createErrorContext();
		const container = document.createElement('div');
		render(component(ErrorLinkApp, { errors }), container);
		container.querySelector('a')!.click();
		await vi.waitFor(() => expect(errors.errors[0]?.error).toEqual(new Error('link failed')));
	});
});
