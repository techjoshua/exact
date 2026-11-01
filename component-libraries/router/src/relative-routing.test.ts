/** @vitest-environment jsdom */
import { it, expect } from 'vitest';
import { act, createElement, memo } from '@exactjs/react-compat';
import { createRoot } from '@exactjs/react-dom-compat/client19';
import { createMemoryRouter, RouterProvider, useHref, useFormAction } from './modern.js';
import { createExactRouter, createMemoryLocationSource } from './core.js';
import * as modernApi from './modern.js';
import {
	verifyRouterRelativePaths,
	verifyMemoDestinations
} from '../../../packages/component-composition-corpus/test-support/router-relative-journey.js';
import { resolveRouteRelativeTo } from './modern/paths.js';

it.each(['history', 'hash'] as const)(
	'updates independently memoized destination hooks in %s mode',
	(mode) =>
		verifyMemoDestinations(
			{
				...modernApi,
				createExactRouter,
				createMemoryLocationSource,
				act,
				createElement,
				memo,
				createRoot
			},
			document,
			mode
		)
);

it.each(['history', 'hash'] as const)(
	'resolves route paths independently of %s hrefs and basename formatting',
	(mode) =>
		verifyRouterRelativePaths(
			{
				...modernApi,
				createExactRouter,
				createMemoryLocationSource,
				act,
				createElement,
				memo,
				createRoot
			},
			document,
			mode
		)
);

it('resolves form actions and hrefs with the same requested path-relative ownership', async () => {
	let observed: unknown;
	function Page() {
		observed = {
			href: useHref('..', { relative: 'path' }),
			form: useFormAction('..', { relative: 'path' }),
			child: useHref('next'),
			query: useHref('?tab=one'),
			route: useHref('..', { relative: 'route' })
		};
		return createElement('output', null, JSON.stringify(observed));
	}
	const router = createMemoryRouter(
		[
			{
				id: 'root',
				path: '/',
				children: [{ id: 'edit', path: 'projects/:id/edit', Component: Page }]
			}
		],
		{ initialEntries: ['/projects/one/edit'] }
	);
	const container = document.createElement('main');
	const root = createRoot(container);
	try {
		await router.initialize();
		await act(() => root.render(createElement(RouterProvider, { router })));
		expect(observed).toEqual({
			href: '/projects/one',
			form: '/projects/one',
			child: '/projects/one/edit/next',
			query: '/projects/one/edit?tab=one',
			route: '/'
		});
	} finally {
		await act(() => root.unmount());
		router.dispose();
	}
});

it('resolves route parents without counting pathless layouts or index matches', () => {
	const router = createMemoryRouter(
		[
			{
				id: 'root',
				path: '/',
				children: [
					{
						id: 'project',
						path: 'projects/:id',
						children: [{ id: 'layout', children: [{ id: 'index', index: true }] }]
					}
				]
			}
		],
		{ initialEntries: ['/projects/one'] }
	);
	try {
		const snapshot = router.getSnapshot();
		expect(resolveRouteRelativeTo('..', snapshot, 'index', undefined)).toBe('/');
		expect(resolveRouteRelativeTo('child', snapshot, 'layout', undefined)).toBe(
			'/projects/one/child'
		);
		expect(resolveRouteRelativeTo('.', snapshot, 'layout', undefined)).toBe('/projects/one');
	} finally {
		router.dispose();
	}
});

it('resolves destinations against their owning component and preserves query and fragment fields', () => {
	const router = createMemoryRouter(
		[
			{
				id: 'root',
				path: '/',
				children: [
					{ id: 'project', path: 'projects/:id', children: [{ id: 'edit', path: 'edit' }] }
				]
			}
		],
		{ initialEntries: ['/projects/one/edit'] }
	);
	try {
		const snapshot = router.getSnapshot();
		const cases = [
			['next', '/projects/one/next'],
			['.', '/projects/one'],
			['', '/projects/one'],
			['..?tab=one#details', '/?tab=one#details'],
			[
				{ pathname: 'next', search: 'tab=one', hash: 'details' },
				'/projects/one/next?tab=one#details'
			],
			['?tab=one', '/projects/one/edit?tab=one'],
			['#details', '/projects/one/edit#details']
		] as const;
		for (const [to, expected] of cases)
			expect(resolveRouteRelativeTo(to, snapshot, 'project', undefined)).toBe(expected);
		expect(resolveRouteRelativeTo('..', snapshot, 'project', 'path')).toBe('/projects');
		expect(resolveRouteRelativeTo('../../..', snapshot, 'project', 'path')).toBe('/');
		expect(resolveRouteRelativeTo('../../..', snapshot, 'project', 'route')).toBe('/');
		expect(resolveRouteRelativeTo('/other', snapshot, 'project', 'route')).toBe('/other');
		expect(resolveRouteRelativeTo('next', snapshot, undefined, 'route')).toBe(
			'/projects/one/edit/next'
		);
		for (const external of ['https://example.test/next', '//example.test/next'])
			expect(resolveRouteRelativeTo(external, snapshot, 'project', 'route')).toBe(external);
		const destination = Object.freeze({ pathname: '../next', search: 'tab=one', hash: 'details' });
		expect(resolveRouteRelativeTo(destination, snapshot, 'project', 'route')).toBe(
			'/next?tab=one#details'
		);
		expect(destination.pathname).toBe('../next');
	} finally {
		router.dispose();
	}
});

it('retains an owning splat while resolving route parents against their non-splat bases', () => {
	const router = createMemoryRouter(
		[{ id: 'root', path: '/', children: [{ id: 'files', path: 'files/*' }] }],
		{ initialEntries: ['/files/one/two'] }
	);
	try {
		const snapshot = router.getSnapshot();
		expect(resolveRouteRelativeTo('next', snapshot, 'files', 'route')).toBe('/files/one/two/next');
		expect(resolveRouteRelativeTo('..', snapshot, 'files', 'path')).toBe('/files/one');
		expect(resolveRouteRelativeTo('..', snapshot, 'files', 'route')).toBe('/');
	} finally {
		router.dispose();
	}
});
