/**
 * @vitest-environment jsdom
 */
import {
	createErrorContext,
	createExpression,
	createVNode,
	isExactComponent,
	type ComponentFunction
} from '@exactjs/core';
import { render } from '@exactjs/dom';
import {
	createRequestContextValue,
	RequestContext,
	runWithRequestContext,
	type RequestResponseState
} from '@exactjs/request';
import { renderToString } from '@exactjs/ssr';
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
import { createMemoryLocationSource, Navigate, Route, Router } from './index.js';

describe('router', () => {
	it('uses compiler identity for authored native fixtures', () => {
		expect(isExactComponent(NestedLayout)).toBe(true);
		expect(isExactComponent(Router)).toBe(true);
	});

	it('matches nested dynamic routes and navigates', async () => {
		const source = createMemoryLocationSource('https://example.test/');
		const container = document.createElement('div');
		render(
			<Router source={source}>
				<Route component={NestedLayout}>
					<Route index component={HomePage} />
					<Route path="users/:id" component={UserPage} />
				</Route>
			</Router>,
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
			<Router source={source} basename="/app" mode="hash">
				<Route path="start" component={BasenamePage} />
			</Router>,
			container
		);
		expect(container.querySelector('a')?.getAttribute('href')).toBe('#/app/start');
		expect(container.querySelector('a')?.getAttribute('aria-current')).toBe('page');
	});

	it('matches explicit fragment-bearing hash sources for SSR parity', () => {
		const source = createMemoryLocationSource('https://example.test/#/app/start?from=ssr');
		const container = document.createElement('div');
		render(
			<Router source={source} basename="/app" mode="hash">
				<Route path="start" component={HashPage} />
			</Router>,
			container
		);
		expect(container.querySelector('p')?.textContent).toBe('?from=ssr');
		expect(container.querySelector('a')?.getAttribute('href')).toBe('#/app/start?page=2');
	});

	it('collects routes generated inside compiled fragments', () => {
		const routeType = Route as unknown as ComponentFunction<any, any>;
		const generated = [
			createVNode(routeType, {
				path: createExpression(() => 'guides/routing'),
				component: createExpression(() => GeneratedPage)
			}),
			createVNode(routeType, {
				path: createExpression(() => 'learn/state'),
				component: createExpression(() => StatePage)
			})
		];
		const source = createMemoryLocationSource('https://example.test/guides/routing');
		const container = document.createElement('div');
		render(
			<Router source={source}>
				<Route component={GeneratedLayout}>
					{generated}
					<Route path="*" component={MissingPage} />
				</Route>
			</Router>,
			container
		);
		expect(container.querySelector('p')?.textContent).toBe('Generated route');
		container.querySelectorAll('a')[1]!.click();
		expect(container.querySelector('p')?.textContent).toBe('State route');
		container.querySelectorAll('a')[0]!.click();
		expect(source.location().pathname).toBe('/guides/routing');
		expect(container.querySelector('p')?.textContent).toBe('Generated route');
	});

	it('keeps the current pathname for query and fragment targets', () => {
		const source = createMemoryLocationSource('https://example.test/users/42');
		const container = document.createElement('div');
		render(
			<Router source={source}>
				<Route path="users/:id" component={TargetLinksPage} />
			</Router>,
			container
		);
		expect(
			Array.from(container.querySelectorAll('a'), (anchor) => anchor.getAttribute('href'))
		).toEqual(['/users/42?page=2', '/users/42#details']);
	});

	it('does not strip a basename from a partial segment', () => {
		const container = document.createElement('div');
		render(
			<Router source={createMemoryLocationSource('https://example.test/apple')} basename="/app">
				<Route path="le" component={ApplePage} />
			</Router>,
			container
		);
		expect(container.textContent).toBe('');
	});

	it('reads SSR request URLs and records redirects', () => {
		const first: RequestResponseState = { headers: new Headers(), committed: false };
		runWithRequestContext(
			createRequestContextValue(
				{ url: 'https://example.test/old', publicOrigin: 'https://example.test' },
				first
			),
			() =>
				renderToString(
					<Router>
						<Route path="old" component={Navigate} componentProps={{ to: '/new', status: 301 }} />
					</Router>
				)
		);
		expect(first.redirect).toEqual({ location: new URL('https://example.test/new'), status: 301 });

		const second: RequestResponseState = { headers: new Headers(), committed: false };
		runWithRequestContext(
			createRequestContextValue(
				{ url: 'https://example.test/old', publicOrigin: 'https://example.test' },
				second
			),
			() =>
				renderToString(
					<Router>
						<Route
							path="old"
							component={Navigate}
							componentProps={{ to: '/pushed', replace: false, status: 307 }}
						/>
					</Router>
				)
		);
		expect(second.redirect).toEqual({
			location: new URL('https://example.test/pushed'),
			status: 307
		});
	});

	it('prefers explicitly propagated server request context over ambient storage', () => {
		const response: RequestResponseState = { headers: new Headers(), committed: false };
		const request = createRequestContextValue(
			{
				url: 'https://example.test/explicit',
				publicOrigin: 'https://example.test'
			},
			response
		);
		const rendered = renderToString(
			<Router>
				<Route path="explicit" component={Navigate} componentProps={{ to: '/next', status: 308 }} />
			</Router>,
			{ contexts: new Map([[RequestContext.id, request]]) }
		);
		expect(rendered.html).toContain('exact:component');
		expect(response.redirect).toEqual({
			location: new URL('https://example.test/next'),
			status: 308
		});
	});

	it('observes rejected consumer link callbacks', async () => {
		const errors = createErrorContext();
		const container = document.createElement('div');
		render(<ErrorLinkApp errors={errors} />, container);
		container.querySelector('a')!.click();
		await vi.waitFor(() => expect(errors.errors[0]?.error).toEqual(new Error('link failed')));
	});
});
