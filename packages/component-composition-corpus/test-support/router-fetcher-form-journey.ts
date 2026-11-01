type RouterFormApi = Pick<
	typeof import('@exactjs/router/modern'),
	'createMemoryRouter' | 'RouterProvider' | 'useFetcher' | 'useSubmit' | 'Form'
> &
	Pick<typeof import('@exactjs/react-compat'), 'act' | 'createElement'> &
	Pick<typeof import('@exactjs/react-dom-compat/client19'), 'createRoot'>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('Router forms: ' + message);
}

/** Waits for an authored action to enter its gate before testing cancellation or publication. */
async function waitFor(predicate: () => boolean): Promise<void> {
	for (let turn = 0; turn < 100; turn++) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error('Router action did not enter its gate');
}

/** Exercises independent submissions, retained inputs, subsequent work, and pending-owner cleanup. */
export async function verifyFetcherFormLifecycle(
	api: RouterFormApi,
	document: Document
): Promise<void> {
	let finish: (() => void) | undefined;
	let cancel = true;
	const submissions: string[] = [];
	const signals: AbortSignal[] = [];
	function Page() {
		const fetcher = api.useFetcher<string>();
		return api.createElement(
			'section',
			null,
			api.createElement(
				fetcher.Form,
				{
					action: '/?save=1',
					method: 'post',
					onSubmit: (event: SubmitEvent) => {
						if (cancel) event.preventDefault();
					}
				},
				api.createElement('input', { name: 'value', defaultValue: 'first' })
			),
			api.createElement('output', null, `${fetcher.state}:${fetcher.data ?? ''}`)
		);
	}
	const router = api.createMemoryRouter([
		{
			id: 'home',
			path: '/',
			Component: Page,
			action: async ({ request, signal }) => {
				signals.push(signal);
				submissions.push(String((await request.formData()).get('value')));
				await new Promise<void>((resolve) => {
					finish = resolve;
				});
				return 'saved';
			}
		}
	]);
	const container = document.createElement('div');
	const reports: unknown[] = [];
	const report = (error: unknown) => reports.push(error);
	const root = api.createRoot(container, {
		onCaughtError: report,
		onUncaughtError: report,
		onRecoverableError: report
	});
	try {
		await router.initialize();
		await api.act(() => root.render(api.createElement(api.RouterProvider, { router })));
		const form = container.querySelector('form')!;
		const input = form.querySelector('input')!;
		const submit = () =>
			api.act(() => {
				form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
			});
		await submit();
		check(router.getSnapshot().fetchers.size === 0, 'prevented submissions do not start work');
		cancel = false;
		for (const value of ['first', 'second']) {
			input.value = value;
			await submit();
			check(
				container.querySelector('form') === form && container.querySelector('input') === input,
				'fetcher updates retain form and input identity'
			);
			check(
				container.querySelector('output')?.textContent === 'submitting:',
				'pending fetcher state is visible'
			);
			await waitFor(() => submissions.at(-1) === value && finish !== undefined);
			await api.act(() => {
				finish!();
				finish = undefined;
			});
			check(
				container.querySelector('output')?.textContent === 'idle:saved',
				'completion belongs to the fetcher'
			);
			check(
				router.getSnapshot().location.search === '',
				'submissions preserve the current location'
			);
		}
		check(
			submissions.join(',') === 'first,second',
			'the retained form supports subsequent submissions'
		);
		input.value = 'pending';
		await submit();
		await waitFor(() => submissions.at(-1) === 'pending' && finish !== undefined);
		await api.act(() => root.unmount());
		check(signals.at(-1)?.aborted === true, 'unmount cancels pending fetcher work');
		await api.act(() => {
			finish!();
			finish = undefined;
		});
		check(container.childNodes.length === 0, 'late completion cannot resurrect the form');
	} finally {
		finish?.();
		await api.act(() => root.unmount());
		router.dispose();
		router.releaseFetcher('finished');
		check(reports.length === 0, 'form lifecycle emits no unexpected framework reports');
	}
}

/** Checks equivalent GET input forms through independent loading or page navigation. */
export async function verifyGetFormSubmission(
	api: RouterFormApi,
	document: Document,
	navigation: boolean
): Promise<void> {
	let fetcher!: ReturnType<typeof api.useFetcher<string>>;
	let submit!: ReturnType<typeof api.useSubmit>;
	function Page() {
		fetcher = api.useFetcher<string>();
		submit = api.useSubmit();
		return api.createElement(
			'section',
			null,
			api.createElement(
				navigation ? api.Form : fetcher.Form,
				{ action: '/?discard=1#receipt#detail' },
				api.createElement('input', { name: 'value', defaultValue: 'two' })
			),
			api.createElement('output', null, fetcher.data)
		);
	}
	const router = api.createMemoryRouter([
		{
			id: 'home',
			path: '/',
			Component: Page,
			loader: ({ request }) => new URL(request.url).search
		}
	]);
	const container = document.createElement('div');
	const reports: unknown[] = [];
	const report = (error: unknown) => reports.push(error);
	const root = api.createRoot(container, {
		onCaughtError: report,
		onUncaughtError: report,
		onRecoverableError: report
	});
	try {
		await router.initialize();
		await api.act(() => root.render(api.createElement(api.RouterProvider, { router })));
		const formData = new FormData();
		formData.append('value', 'one');
		for (const target of [{ value: 'one' }, new URLSearchParams('value=one'), formData]) {
			await api.act(async () => {
				await (navigation ? submit : fetcher.submit)(target, {
					action: '/?discard=1#receipt#detail',
					method: 'get'
				});
			});
			check(fetcher.error === undefined, 'GET submissions do not attach a request body');
			const location = router.getSnapshot().location;
			if (navigation) {
				check(
					location.search === '?value=one' && location.hash === '#receipt#detail',
					'GET navigation replaces query data and preserves the entire fragment'
				);
			} else {
				check(
					fetcher.data === '?value=one' && location.search === '',
					'GET loading uses query data without navigating'
				);
			}
		}
		await api.act(() => {
			container
				.querySelector('form')!
				.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		});
		await waitFor(() =>
			navigation
				? router.getSnapshot().location.search === '?value=two'
				: fetcher.data === '?value=two'
		);
		check(
			navigation || router.getSnapshot().location.search === '',
			'GET forms retain their submission owner'
		);
		check(fetcher.error === undefined, 'native form GET input is valid');
	} finally {
		await api.act(() => root.unmount());
		router.dispose();
		check(reports.length === 0, 'GET submission emits no unexpected framework reports');
	}
}

/** Reports a navigation form failure through its owner and retains the form for a following submission. */
export async function verifyNavigationFormFailure(
	api: RouterFormApi,
	document: Document
): Promise<void> {
	let fail = true;
	const reports: unknown[] = [];
	function Page() {
		return api.createElement(
			api.Form,
			{ action: '/save', method: 'post' },
			api.createElement('input', { name: 'value', defaultValue: 'ready' })
		);
	}
	const router = api.createMemoryRouter([
		{ id: 'home', path: '/', Component: Page },
		{
			id: 'save',
			path: '/save',
			action: () =>
				fail ? new Response(null, { status: 302, headers: { Location: '/loop' } }) : 'saved'
		},
		{
			id: 'loop',
			path: '/loop',
			loader: () => new Response(null, { status: 302, headers: { Location: '/loop' } })
		}
	]);
	const container = document.createElement('div');
	const root = api.createRoot(container, { onUncaughtError: (error) => reports.push(error) });
	try {
		await router.initialize();
		await api.act(() => root.render(api.createElement(api.RouterProvider, { router })));
		const form = container.querySelector('form')!;
		const submit = () =>
			api.act(() => {
				form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
			});
		await submit();
		await waitFor(() => reports.length === 1 && router.getSnapshot().navigation.state === 'idle');
		check(
			reports[0] instanceof Error && /maximum redirect depth/.test(reports[0].message),
			'navigation rejection reaches its owning error reporter'
		);
		check(container.querySelector('form') === form, 'failure retains the form');
		fail = false;
		await submit();
		await waitFor(
			() =>
				router.getSnapshot().actionData.save === 'saved' &&
				router.getSnapshot().navigation.state === 'idle'
		);
		check(
			reports.length === 1 && container.querySelector('form') === form,
			'following submission progresses without another report or replacement'
		);
	} finally {
		await api.act(() => root.unmount());
		router.dispose();
	}
}
