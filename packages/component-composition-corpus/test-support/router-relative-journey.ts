import type { RouteObject } from '@exactjs/router/modern';

type Api = Pick<
	typeof import('@exactjs/router'),
	'createExactRouter' | 'createMemoryLocationSource'
> &
	Pick<
		typeof import('@exactjs/router/modern'),
		'RouterProvider' | 'useResolvedPath' | 'useFormAction' | 'useHref' | 'NavLink' | 'Link'
	> &
	Pick<typeof import('@exactjs/react-compat'), 'act' | 'createElement' | 'memo'> &
	Pick<typeof import('@exactjs/react-dom-compat/client19'), 'createRoot'>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('Router relative destinations: ' + message);
}

/** Observes each destination hook independently through retained memoized consumers. */
export async function verifyMemoDestinations(
	api: Api,
	document: Document,
	mode: 'history' | 'hash'
): Promise<void> {
	const Href = api.memo(() => api.createElement('a', { href: api.useHref('child') }, 'child'));
	const Path = api.memo(() => api.createElement('output', null, api.useResolvedPath('.').pathname));
	function Page() {
		return api.createElement('section', null, api.createElement(Href), api.createElement(Path));
	}
	const initial = '/app/users/one';
	const router = api.createExactRouter<RouteObject>({
		mode,
		basename: '/app',
		source: api.createMemoryLocationSource([mode === 'hash' ? `/#${initial}` : initial]),
		routes: [{ id: 'user', path: '/users/:id', Component: Page }]
	});
	const container = document.createElement('main');
	let root: ReturnType<Api['createRoot']> | undefined;
	try {
		root = api.createRoot(container);
		await router.initialize();
		await api.act(() => root!.render(api.createElement(api.RouterProvider, { router })));
		const anchor = container.querySelector('a');
		const output = container.querySelector('output');
		await api.act(() => router.navigate('/users/two'));
		check(
			container.querySelector('a') === anchor && container.querySelector('output') === output,
			'memoized destination consumers retain their nodes'
		);
		check(
			anchor?.getAttribute('href') === `${mode === 'hash' ? '#' : ''}/app/users/two/child`,
			'href hook observes location without another hook subscribing for it'
		);
		check(
			output?.textContent === '/users/two',
			'resolved path hook independently observes location'
		);
	} finally {
		try {
			await api.act(() => root?.unmount());
		} finally {
			router.dispose();
		}
	}
}

/** Checks route paths, href formatting and retained link navigation across optional basenames. */
export async function verifyRouterRelativePaths(
	api: Api,
	document: Document,
	mode: 'history' | 'hash'
): Promise<void> {
	for (const basename of ['', '/app']) {
		let observed:
			| {
					path: ReturnType<Api['useResolvedPath']>;
					current: ReturnType<Api['useResolvedPath']>;
					child: ReturnType<Api['useResolvedPath']>;
					form: string;
					href: string;
			  }
			| undefined;
		function Page() {
			observed = {
				path: api.useResolvedPath('..', { relative: 'path' }),
				current: api.useResolvedPath('.'),
				child: api.useResolvedPath('two words?tab=one#details'),
				form: api.useFormAction('..', { relative: 'path' }),
				href: api.useHref('..', { relative: 'path' })
			};
			return api.createElement(
				'div',
				null,
				api.createElement(api.NavLink, { to: '.', end: true }, 'Current'),
				api.createElement(
					api.NavLink,
					{ to: '../edit', relative: 'path', end: true },
					'Path current'
				),
				api.createElement(api.Link, { to: '//elsewhere.example/next' }, 'External')
			);
		}
		const pathname = `${basename}/projects/one/edit`;
		const router = api.createExactRouter<RouteObject>({
			mode,
			basename,
			source: api.createMemoryLocationSource([mode === 'hash' ? `/#${pathname}` : pathname]),
			routes: [{ id: 'edit', path: 'projects/:id/edit', Component: Page }]
		});
		const container = document.createElement('main');
		let root: ReturnType<Api['createRoot']> | undefined;
		try {
			root = api.createRoot(container);
			await router.initialize();
			await api.act(() => root!.render(api.createElement(api.RouterProvider, { router })));
			check(
				observed?.path.pathname === '/projects/one' &&
					observed.path.search === '' &&
					observed.path.hash === '',
				'path parents remove a segment without href formatting'
			);
			check(
				observed?.current.pathname === '/projects/one/edit' &&
					observed.current.search === '' &&
					observed.current.hash === '',
				'current route remains independent of basename and mode'
			);
			check(
				observed?.child.pathname === '/projects/one/edit/two words' &&
					observed.child.search === '?tab=one' &&
					observed.child.hash === '#details',
				'route fields retain unencoded content'
			);
			const expectedParent = `${mode === 'hash' ? '#' : ''}${basename}/projects/one`;
			check(
				observed?.form === `${basename}/projects/one` && observed.href === expectedParent,
				'form actions and hrefs honor the same relative mode'
			);
			const expectedHref = `${mode === 'hash' ? '#' : ''}${pathname}`;
			const links = container.querySelectorAll('a');
			check(links.length === 3, 'internal and external links mount');
			for (const link of [links[0]!, links[1]!]) {
				check(link.getAttribute('aria-current') === 'page', 'active presentation uses route paths');
				check(
					link.getAttribute('href') === expectedHref,
					'browser href honors basename, mode and relative options'
				);
				check(!link.hasAttribute('relative'), 'routing options stay out of DOM attributes');
			}
			const link = links[1]!;
			await api.act(() => link.click());
			check(
				router.getSnapshot().location.pathname === '/projects/one/edit' &&
					router.getSnapshot().historyAction === 'PUSH',
				'click navigation agrees with the resolved href'
			);
			check(
				container.querySelectorAll('a')[1] === link,
				'same-route navigation retains anchor identity'
			);
			const external = links[2]!;
			check(
				external.getAttribute('href') === '//elsewhere.example/next',
				'network-relative href retains its authority'
			);
			const before = router.getSnapshot();
			let intercepted: boolean | undefined;
			const observe = (event: Event) => {
				intercepted = event.defaultPrevented;
				// Observe after the framework listener, then prevent the browser leaving the harness.
				event.preventDefault();
			};
			external.addEventListener('click', observe);
			try {
				await api.act(() => external.click());
			} finally {
				external.removeEventListener('click', observe);
			}
			check(
				intercepted === false && router.getSnapshot() === before,
				'external link does not start router navigation'
			);
		} finally {
			try {
				await api.act(() => root?.unmount());
			} finally {
				router.dispose();
			}
		}
	}
}
