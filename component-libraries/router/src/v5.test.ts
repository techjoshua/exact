// @vitest-environment jsdom
import { act, createElement } from '@exact/react-compat';
import { createRoot } from '@exact/react-dom-compat/client19';
import { renderToString } from '@exact/react-dom-compat/server19';
import { describe, expect, it, vi } from 'vitest';
import type { RouteComponentProps } from './v5.js';
import {
	Link,
	MemoryRouter,
	Prompt,
	Redirect,
	Route,
	Router,
	StaticRouter,
	Switch,
	useHistory,
	useLocation,
	useParams,
	withRouter
} from './v5.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('React Router v5 facade', () => {
	it('preserves Switch declaration order and route component props', async () => {
		function User() {
			const params = useParams<{ id: string }>();
			return createElement('p', null, `User ${params.id}`);
		}
		const container = document.createElement('div');
		createRoot(container).render(
			createElement(
				MemoryRouter,
				{ initialEntries: ['/users/42'] },
				createElement(
					Switch,
					null,
					createElement(Route, { path: '/users/:id', component: User }),
					createElement(Route, {
						path: '/users/42',
						render: () => createElement('p', null, 'Too specific')
					})
				),
				createElement(Link, { to: '/about' }, 'About')
			)
		);
		await settle();
		expect(container.textContent).toContain('User 42');
		expect(container.textContent).not.toContain('Too specific');
	});

	it('supports history navigation, render children, and withRouter', async () => {
		let observed = '';
		function Details(props: any) {
			observed = `${props.location.pathname}:${props.match.url}:${props.match.params.id}`;
			return createElement('p', null, `${props.location.pathname}:${props.match.params.id}`);
		}
		const Wrapped = withRouter(Details);
		function Controls() {
			const history = useHistory();
			return createElement('button', { onClick: () => history.push('/items/2') }, 'Move');
		}
		const container = document.createElement('div');
		createRoot(container).render(
			createElement(
				MemoryRouter,
				{ initialEntries: ['/items/1'] },
				createElement(Route, { path: '/items/:id' }, (props: RouteComponentProps) =>
					createElement(
						'section',
						null,
						createElement(Wrapped, {}),
						createElement(Controls, {}),
						props.match ? 'matched' : 'missed'
					)
				)
			)
		);
		await settle();
		expect(container.textContent).toContain('/items/1:1');
		await act(() => container.querySelector('button')!.click());
		expect(observed).toBe('/items/2:/items/2:2');
	});

	it('blocks Prompt navigation when confirmation is declined', async () => {
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
		const container = document.createElement('div');
		createRoot(container).render(
			createElement(
				MemoryRouter,
				{ initialEntries: ['/'] },
				createElement(Prompt, { message: 'Leave?' }),
				createElement(Link, { to: '/blocked' }, 'Move'),
				createElement(Route, { path: '/', exact: true, render: () => 'Home' }),
				createElement(Route, { path: '/blocked', render: () => 'Blocked' })
			)
		);
		await settle();
		container.querySelector('a')!.click();
		await settle();
		expect(confirm).toHaveBeenCalledWith('Leave?');
		expect(container.textContent).toContain('Home');
		expect(container.textContent).not.toContain('Blocked');
		confirm.mockRestore();
	});

	it('observes location changes from an external history', async () => {
		let location = { pathname: '/one', search: '', hash: '', key: 'one' };
		let action = 'POP';
		const listeners = new Set<() => void>();
		const history = {
			get location() {
				return location;
			},
			get action() {
				return action;
			},
			push(to: string) {
				action = 'PUSH';
				location = { pathname: to, search: '', hash: '', key: 'two' };
				listeners.forEach((listener) => listener());
			},
			replace() {},
			go() {},
			createHref: (to: string) => to,
			listen(listener: () => void) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			}
		};
		function Current() {
			const history = useHistory();
			return createElement(
				'button',
				{ onClick: () => history.push('/two') },
				useLocation().pathname
			);
		}
		const container = document.createElement('div');
		createRoot(container).render(createElement(Router, { history }, createElement(Current, {})));
		await settle();
		expect(container.textContent).toBe('/one');
		await act(() => container.querySelector('button')!.click());
		expect(container.textContent).toBe('/two');
	});

	it('records Redirect during v5 static rendering', () => {
		const context: Record<string, unknown> = {};
		renderToString(
			createElement(
				StaticRouter,
				{ location: '/old', context },
				createElement(Redirect, { to: '/new' })
			)
		);
		expect(context).toMatchObject({ action: 'REPLACE', url: '/new' });
	});
});
