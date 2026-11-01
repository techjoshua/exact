import type { RouteObject } from '@exactjs/router/modern';

type Api = Pick<
	typeof import('@exactjs/router'),
	'createExactRouter' | 'createMemoryLocationSource'
> &
	Pick<
		typeof import('@exactjs/router/modern'),
		'RouterProvider' | 'Form' | 'useSubmit' | 'useFormAction' | 'useFetcher'
	> &
	Pick<typeof import('@exactjs/react-compat'), 'act' | 'createElement'> &
	Pick<typeof import('@exactjs/react-dom-compat/client19'), 'createRoot'>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('Router form actions: ' + message);
}

/** Retains default-action forms and submit callbacks through a same-route parameter change. */
export async function verifyFormActionDefaults(
	api: Api,
	document: Document,
	mode: 'history' | 'hash'
): Promise<void> {
	for (const basename of ['', '/app']) {
		let first: ReturnType<Api['useSubmit']> | undefined;
		const calls: string[] = [];
		function Page() {
			const submit = api.useSubmit();
			first ??= submit;
			return api.createElement(
				api.Form,
				{ method: 'post' },
				api.createElement('input', { name: 'value', defaultValue: 'one' })
			);
		}
		const initial = `${basename}/users/one`;
		const router = api.createExactRouter<RouteObject>({
			mode,
			basename,
			source: api.createMemoryLocationSource([mode === 'hash' ? `/#${initial}` : initial]),
			routes: [
				{
					id: 'user',
					path: '/users/:id',
					Component: Page,
					action: ({ params }) => {
						calls.push(params.id!);
						return params.id;
					}
				}
			]
		});
		const container = document.createElement('main');
		let root: ReturnType<Api['createRoot']> | undefined;
		try {
			root = api.createRoot(container);
			await router.initialize();
			await api.act(() => root!.render(api.createElement(api.RouterProvider, { router })));
			const form = container.querySelector('form')!;
			check(
				form.getAttribute('action') === initial,
				'default form action uses its route and basename without a hash prefix'
			);
			await api.act(() => first!(form));
			await api.act(() => router.navigate('/users/two'));
			check(
				container.querySelector('form') === form &&
					form.getAttribute('action') === `${basename}/users/two`,
				'same route retains its form while updating the action'
			);
			await api.act(() => first!({ value: 'two' }, { method: 'post' }));
			check(
				calls.join(',') === 'one,two',
				'retained callback submits to the route at invocation time'
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

/** Preserves index selection and default query values, including GET fields and file names. */
export async function verifyIndexFormActions(
	api: Api,
	document: Document,
	mode: 'history' | 'hash'
): Promise<void> {
	let observed: { implicit: string; dot: string; parent: string } | undefined;
	let fetcher: ReturnType<Api['useFetcher']> | undefined;
	let submit: ReturnType<Api['useSubmit']> | undefined;
	const calls: string[] = [];
	function Page() {
		observed = {
			implicit: api.useFormAction(),
			dot: api.useFormAction('.'),
			parent: api.useFormAction('..')
		};
		fetcher = api.useFetcher<string>();
		submit = api.useSubmit();
		return api.createElement(
			'section',
			null,
			api.createElement(fetcher.Form, { method: 'get' }),
			api.createElement('output', null, String(fetcher.data ?? ''))
		);
	}
	const initial = '/app/projects/one?index&index=one&tab=two#details';
	const router = api.createExactRouter<RouteObject>({
		mode,
		basename: '/app',
		source: api.createMemoryLocationSource([mode === 'hash' ? `/#${initial}` : initial]),
		routes: [
			{
				id: 'root',
				path: '/',
				children: [
					{
						id: 'project',
						path: 'projects/:id',
						loader: () => {
							calls.push('parent');
							return 'parent';
						},
						action: () => {
							calls.push('parent-action');
							return 'parent-action';
						},
						children: [
							{
								id: 'index',
								index: true,
								Component: Page,
								loader: ({ request }) => {
									calls.push('index');
									return new URL(request.url).search;
								},
								action: () => {
									calls.push('index-action');
									return 'index-action';
								}
							}
						]
					}
				]
			}
		]
	});
	const container = document.createElement('main');
	let root: ReturnType<Api['createRoot']> | undefined;
	try {
		root = api.createRoot(container);
		await router.initialize();
		await api.act(() => root!.render(api.createElement(api.RouterProvider, { router })));
		check(
			observed?.implicit === '/app/projects/one?index&tab=two&index=one' &&
				observed.dot === '/app/projects/one?index' &&
				observed.parent === '/app',
			'omitted and explicit actions retain distinct index and query semantics'
		);
		check(
			container.querySelector('form')?.getAttribute('action') === observed?.implicit,
			'fetcher form renders the selected action'
		);
		calls.length = 0;
		const fields = new URLSearchParams('value=one&index=customer');
		await api.act(() => fetcher!.submit(fields, { method: 'GET' }));
		let result = new URLSearchParams(container.querySelector('output')!.textContent!);
		check(
			calls.join(',') === 'index' &&
				result.getAll('index').join(',') === 'customer,' &&
				result.get('value') === 'one' &&
				!result.has('tab'),
			'GET fetcher retains index selection while replacing ordinary query values'
		);
		check(
			fields.toString() === 'value=one&index=customer',
			'GET serialization never mutates caller parameters'
		);
		const data = new FormData();
		data.append('file', new File(['contents'], 'a&b.txt'));
		data.append('value', 'first');
		data.append('value', 'second');
		await api.act(() => fetcher!.submit(data, { method: 'GET' }));
		result = new URLSearchParams(container.querySelector('output')!.textContent!);
		check(
			result.get('file') === 'a&b.txt' && result.getAll('value').join(',') === 'first,second',
			'GET file values use names and ordinary repeated fields retain order'
		);
		await api.act(() => fetcher!.submit(new URLSearchParams('index='), { method: 'GET' }));
		check(
			new URLSearchParams(container.querySelector('output')!.textContent!).getAll('index')
				.length === 1,
			'existing naked index field needs no duplicate marker'
		);
		calls.length = 0;
		await api.act(() => submit!({ value: 'parent' }, { action: '/projects/one', method: 'POST' }));
		check(calls[0] === 'parent-action', 'explicit parent submission selects the parent action');
		calls.length = 0;
		await api.act(() => submit!({ value: 'index' }, { method: 'POST' }));
		check(calls[0] === 'index-action', 'default index submission selects its index action');
	} finally {
		try {
			await api.act(() => root?.unmount());
		} finally {
			router.dispose();
		}
	}
}

/** Uses browser-native Request and FormData to verify mutation MIME types, boundaries and file content. */
export async function verifySubmissionEncodings(api: Api, document: Document): Promise<void> {
	let submit: ReturnType<Api['useSubmit']> | undefined;
	let fetcher: ReturnType<Api['useFetcher']> | undefined;
	const results: { type: string; body: string }[] = [];
	const calls: string[] = [];
	function Page() {
		submit = api.useSubmit();
		fetcher = api.useFetcher();
		return api.createElement(
			api.Form,
			{ method: 'post' },
			api.createElement('input', { name: 'value', defaultValue: 'one' })
		);
	}
	const router = api.createExactRouter<RouteObject>({
		source: api.createMemoryLocationSource('/home'),
		routes: [
			{
				id: 'home',
				path: '/home',
				Component: Page,
				action: async ({ request }) => {
					calls.push('action');
					results.push({
						type: request.headers.get('content-type') ?? '',
						body: await request.text()
					});
					return 'ok';
				}
			}
		]
	});
	const container = document.createElement('main');
	let root: ReturnType<Api['createRoot']> | undefined;
	try {
		root = api.createRoot(container);
		await router.initialize();
		await api.act(() => root!.render(api.createElement(api.RouterProvider, { router })));
		await api.act(() => submit!(container.querySelector('form')!));
		let result = results.at(-1)!;
		check(
			result.type.startsWith('application/x-www-form-urlencoded') && result.body === 'value=one',
			'default DOM form uses URL-encoded fields'
		);
		await api.act(() => submit!({ value: 'one' }, { method: 'POST', encType: 'application/json' }));
		result = results.at(-1)!;
		check(
			result.type === 'application/json' && JSON.parse(result.body).value === 'one',
			'requested JSON body and content type agree'
		);
		await api.act(() =>
			fetcher!.submit({ value: 'one' }, { method: 'POST', encType: 'text/plain' })
		);
		result = results.at(-1)!;
		check(
			result.type.startsWith('text/plain') && result.body === 'value=one\r\n',
			'fetcher and navigation share text encoding'
		);
		const file = new File(['file contents'], 'report.txt', { type: 'text/plain' });
		const data = new FormData();
		data.append('file', file);
		data.append('value', 'one');
		await api.act(() => fetcher!.submit(data, { method: 'POST', encType: 'multipart/form-data' }));
		result = results.at(-1)!;
		const parsed = await new Request('https://example.test/body', {
			method: 'POST',
			headers: { 'Content-Type': result.type },
			body: result.body
		}).formData();
		check(
			result.type.startsWith('multipart/form-data; boundary=') && parsed.get('value') === 'one',
			'Request generates a usable multipart boundary'
		);
		const received = parsed.get('file');
		check(
			received instanceof File &&
				received.name === 'report.txt' &&
				(await received.text()) === 'file contents',
			'multipart file contents and filename reach the handler'
		);
		check(
			data.get('file') === file && data.get('value') === 'one',
			'encoding preserves caller FormData'
		);
		const before = calls.length;
		let rejected = false;
		try {
			await submit!({ value: 'one' }, { method: 'POST', encType: 'invalid/type' });
		} catch {
			rejected = true;
		}
		check(
			rejected && calls.length === before && router.getSnapshot().navigation.state === 'idle',
			'unsupported encoding rejects before dispatch and pending state'
		);
	} finally {
		try {
			await api.act(() => root?.unmount());
		} finally {
			router.dispose();
		}
	}
}
