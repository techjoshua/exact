type CoreApi = Pick<
	typeof import('@exactjs/router'),
	'matchRoutes' | 'matchPath' | 'generatePath' | 'createExactRouter' | 'createMemoryLocationSource'
>;
type ClientApi = Pick<
	typeof import('@exactjs/router/modern'),
	'createMemoryRouter' | 'RouterProvider' | 'Outlet'
> &
	Pick<typeof import('@exactjs/react-compat'), 'act' | 'createElement'> &
	Pick<typeof import('@exactjs/react-dom-compat/client19'), 'createRoot'>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('Route matching: ' + message);
}

/** Checks parent branches, optional omission and precedence, bounded ambiguity and encoded splat bases. */
export function verifyRouteMatching(api: CoreApi): void {
	const tree = [
		{
			id: 'parent',
			path: '/home',
			children: [{ id: 'child', path: 'child', children: [{ id: 'grand', path: 'grand' }] }]
		}
	];
	for (const [path, expected] of [
		['/home', 'parent'],
		['/home/child', 'parent,child'],
		['/home/child/grand', 'parent,child,grand']
	] as const)
		check(
			api
				.matchRoutes(tree, path)
				.map((match) => match.id)
				.join(',') === expected,
			'parent and descendant URLs match their own complete branches'
		);
	check(api.matchRoutes(tree, '/unknown').length === 0, 'unmatched URL remains empty');
	const pattern = '/:language?/about';
	const omitted = api.generatePath(pattern, {});
	check(
		omitted === '/about' &&
			Object.keys(api.matchPath(pattern, omitted)?.params ?? { unexpected: true }).length === 0,
		'generated omitted path matches without a parameter'
	);
	check(
		api.matchPath(pattern, '/en/about')?.params.language === 'en',
		'present optional parameter remains captured'
	);
	check(
		api
			.matchRoutes(
				[{ id: 'layout', path: '/:language?', children: [{ id: 'about', path: 'about' }] }],
				'/about'
			)
			.map((match) => match.id)
			.join(',') === 'layout,about',
		'parent omission respects the child literal'
	);
	const absolute = api.matchRoutes(
		[{ id: 'parent', path: '/:language?', children: [{ id: 'child', path: '/:language?/about' }] }],
		'/about'
	);
	check(
		absolute.length === 2 &&
			absolute[0]!.pathname === '/' &&
			Object.keys(absolute[1]!.params).length === 0,
		'absolute child and parent share optional-prefix choices'
	);
	const sensitive = api.matchRoutes(
		[
			{
				id: 'parent',
				path: '/:prefix?/A',
				children: [{ id: 'child', path: '/:prefix?/A/:tail?', caseSensitive: true }]
			}
		],
		'/A/a'
	);
	check(
		sensitive.at(-1)?.id === 'child' &&
			sensitive[0]!.pathname === '/A' &&
			sensitive.at(-1)?.params.tail === 'a',
		'stricter child policy constrains shared prefix planning'
	);
	const literal = { id: 'literal', path: '/about' };
	const optional = { id: 'optional', path: pattern };
	check(
		api.matchRoutes([literal, optional], '/about').at(-1)?.id === 'literal' &&
			api.matchRoutes([optional, literal], '/about').at(-1)?.id === 'optional',
		'omitted parameter ranking preserves declaration ties'
	);
	for (const path of ['/files/a/b', '/files/a%2Fb', '/files/a%2Fb/c'])
		check(
			api.matchPath('/files/*', path)?.pathnameBase === '/files',
			'encoded slashes cannot change the splat URL base'
		);
	const prototype = api.matchPath('/:__proto__?/about', '/value/about');
	check(
		prototype !== null &&
			Object.hasOwn(prototype.params, '__proto__') &&
			prototype.params.__proto__ === 'value',
		'optional capture preserves prototype-named own values'
	);
	const broad = '/' + Array.from({ length: 96 }, (_, index) => `:p${index}?`).join('/') + '/done';
	const prefix = '/' + Array.from({ length: 48 }, () => 'value').join('/');
	check(
		Object.keys(api.matchPath(broad, prefix + '/done')?.params ?? {}).length === 48 &&
			api.matchPath(broad, prefix + '/missing') === null,
		'ambiguous patterns have bounded valid and invalid outcomes'
	);
}

/** Routes page data through the selected parent, child and optional branch across live transitions. */
export async function verifyRouteMatchingTransitions(api: CoreApi): Promise<void> {
	const calls: string[] = [];
	const loader = (name: string) => () => {
		calls.push(name);
		return name;
	};
	const router = api.createExactRouter({
		source: api.createMemoryLocationSource('/home'),
		routes: [
			{
				id: 'parent',
				path: '/home',
				loader: loader('parent'),
				children: [{ id: 'child', path: 'child', loader: loader('child') }]
			},
			{
				id: 'optional',
				path: '/optional/:language?/about',
				loader: ({ params }) => params.language ?? 'default'
			}
		]
	});
	try {
		await router.initialize();
		check(
			calls.join(',') === 'parent' && router.getSnapshot().loaderData.parent === 'parent',
			'initial parent URL loads its own route'
		);
		calls.length = 0;
		await router.navigate('/home/child');
		check(
			calls.join(',') === 'parent,child' && router.getSnapshot().loaderData.child === 'child',
			'child URL loads matched ancestry'
		);
		await router.navigate('/optional/about');
		check(
			router.getSnapshot().loaderData.optional === 'default' &&
				router.getSnapshot().matches.at(-1)?.id === 'optional',
			'omitted parameter loads the intended route'
		);
		await router.navigate('/optional/en/about');
		check(
			router.getSnapshot().loaderData.optional === 'en',
			'following present parameter updates the same route'
		);
	} finally {
		router.dispose();
	}
}

/** Preserves a mounted parent host while its child appears and disappears through accepted matches. */
export async function verifyParentRoutePresentation(
	api: ClientApi,
	document: Document
): Promise<void> {
	function Parent() {
		return api.createElement(
			'section',
			{ 'data-parent': 'owned' },
			'parent',
			api.createElement(api.Outlet)
		);
	}
	const router = api.createMemoryRouter(
		[
			{
				id: 'parent',
				path: '/home',
				element: api.createElement(Parent),
				children: [
					{
						id: 'child',
						path: 'child',
						element: api.createElement('p', { 'data-child': 'owned' }, 'child')
					}
				]
			}
		],
		{ initialEntries: ['/home'] }
	);
	const container = document.createElement('div');
	document.body.append(container);
	const root = api.createRoot(container);
	try {
		await api.act(async () => {
			root.render(api.createElement(api.RouterProvider, { router }));
		});
		const parent = container.querySelector('[data-parent]');
		check(
			parent !== null && container.querySelector('[data-child]') === null,
			'parent renders at its own URL without an index child'
		);
		await api.act(async () => {
			await router.navigate('/home/child');
		});
		check(
			container.querySelector('[data-parent]') === parent &&
				container.querySelector('[data-child]')?.textContent === 'child',
			'child appears inside the retained parent host'
		);
		await api.act(async () => {
			await router.navigate('/home');
		});
		check(
			container.querySelector('[data-parent]') === parent &&
				container.querySelector('[data-child]') === null,
			'child removal preserves the parent host'
		);
	} finally {
		await api.act(async () => root.unmount());
		router.dispose();
		container.remove();
	}
}

/** Restricts compatibility matching to complete basename prefixes without altering native source interpretation. */
export function verifyCompatibilityBasenames(
	api: Pick<typeof import('@exactjs/router/modern'), 'matchRoutes'>
): void {
	for (const [path, basename, route, expected] of [
		['/app/foo', '/app', 'foo', true],
		['/APP/foo', '/app/', 'foo', true],
		['/app', '/app', '/', true],
		['/apple/foo', '/app', 'le/foo', false],
		['/outside', '/app', 'outside', false],
		['/foo', '', 'foo', true]
	] as const) {
		const routes = [{ id: 'page', path: route }];
		const matches = api.matchRoutes(routes, path, basename);
		check(
			expected ? matches?.[0]?.route.id === 'page' : matches === null,
			'compatibility basename selection respects complete path segments'
		);
		const objectMatches = api.matchRoutes(routes, { pathname: path }, basename);
		check(
			expected ? objectMatches?.[0]?.route.id === 'page' : objectMatches === null,
			'location-object matching uses the same basename contract'
		);
	}
}
