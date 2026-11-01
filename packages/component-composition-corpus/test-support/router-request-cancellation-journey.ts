type Api = Pick<typeof import('@exactjs/router/modern'), 'createStaticHandler'>;
type CoreApi = Pick<
	typeof import('@exactjs/router'),
	'createExactRouter' | 'createMemoryLocationSource'
>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('Router request cancellation: ' + message);
}

/** Rejects initial and pending cancellation across static read and mutation query methods. */
export async function verifyStaticQueryCancellation(api: Api): Promise<void> {
	for (const method of ['GET', 'HEAD', 'POST'])
		for (const route of [false, true]) {
			let calls = 0;
			const operation = () => {
				calls++;
				return 'value';
			};
			const handler = api.createStaticHandler([
				{ id: 'home', path: '/home', loader: operation, action: operation }
			]);
			const owner = new AbortController();
			owner.abort(null);
			const request = new Request('https://example.test/home', { method, signal: owner.signal });
			const result = await (route ? handler.queryRoute(request) : handler.query(request)).then(
				() => ({ rejected: false, reason: undefined }),
				(reason) => ({ rejected: true, reason })
			);
			check(
				result.rejected && result.reason === null && calls === 0,
				'initial cancellation rejects exactly before invoking handlers'
			);
		}
	for (const method of ['GET', 'HEAD', 'POST'])
		for (const route of [false, true]) {
			let finish!: () => void;
			let entered!: () => void;
			let signal: AbortSignal | undefined;
			let requestSignal: AbortSignal | undefined;
			const gate = new Promise<void>((resolve) => {
				finish = resolve;
			});
			const ready = new Promise<void>((resolve) => {
				entered = resolve;
			});
			const operation = async (args: { request: Request; signal: AbortSignal }) => {
				signal = args.signal;
				requestSignal = args.request.signal;
				entered();
				await gate;
				return 'late';
			};
			const handler = api.createStaticHandler([
				{ id: 'home', path: '/home', loader: operation, action: operation }
			]);
			const owner = new AbortController();
			const request = new Request('https://example.test/home', { method, signal: owner.signal });
			const query = (route ? handler.queryRoute(request) : handler.query(request)).then(
				() => ({ rejected: false, reason: undefined }),
				(reason) => ({ rejected: true, reason })
			);
			let timeout: ReturnType<typeof setTimeout> | number | undefined;
			try {
				await ready;
				owner.abort(null);
				const outcome = await Promise.race([
					query,
					new Promise<undefined>((resolve) => {
						timeout = setTimeout(resolve, 1000);
					})
				]);
				check(
					signal?.aborted === true && requestSignal?.aborted === true,
					'pending request cancels operation and its handler Request'
				);
				check(
					outcome?.rejected === true && outcome.reason === null,
					'pending query settles exactly without waiting for its handler'
				);
			} finally {
				clearTimeout(timeout);
				finish();
				await query;
			}
		}
	const live = api.createStaticHandler([{ id: 'home', path: '/home', loader: () => 'live' }]);
	const result = await live.query(new Request('https://example.test/home'));
	check(
		!(result instanceof Response) && result.loaderData.home === 'live',
		'uncanceled following query progresses normally'
	);
}

/** Observes owned operation cancellation through the Request supplied to every handler entry. */
export async function verifyHandlerRequestSignals(api: CoreApi): Promise<void> {
	for (const mode of ['initialize', 'submit', 'fetch']) {
		let entered!: () => void;
		let finish!: () => void;
		const ready = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const gate = new Promise<void>((resolve) => {
			finish = resolve;
		});
		let signals: { request: AbortSignal; operation: AbortSignal } | undefined;
		const handler = async (args: { request: Request; signal: AbortSignal }) => {
			signals = { request: args.request.signal, operation: args.signal };
			entered();
			await gate;
			return 'late';
		};
		const router = api.createExactRouter({
			source: api.createMemoryLocationSource('/home'),
			routes: [{ id: 'home', path: '/home', loader: handler, action: handler }]
		});
		const pending =
			mode === 'initialize'
				? router.initialize()
				: mode === 'submit'
					? router.submit('/home', { method: 'POST' })
					: router.fetch('key', 'home', '/home');
		try {
			await ready;
			router.dispose();
			check(
				signals?.operation.aborted === true &&
					signals.request.aborted &&
					signals.request.reason === signals.operation.reason,
				'owned cancellation reaches the handler Request with the same reason'
			);
		} finally {
			finish();
			await pending;
			router.dispose();
		}
	}
}

/** Preserves incoming headers and read methods through static queries and action revalidation. */
export async function verifyStaticRequestDetails(api: Api): Promise<void> {
	for (const method of ['GET', 'HEAD', 'POST']) {
		const seen: string[] = [];
		const record = ({ request }: { request: Request }) => {
			seen.push(request.method + ':' + request.headers.get('x-input'));
			return 'value';
		};
		const handler = api.createStaticHandler([
			{ id: 'home', path: '/home', loader: record, action: record }
		]);
		await handler.query(
			new Request('https://example.test/home', { method, headers: { 'x-input': 'present' } })
		);
		check(
			seen.join(',') === (method === 'POST' ? 'POST:present,GET:present' : method + ':present'),
			'incoming metadata reaches the correct handler method'
		);
	}
}

/** Rejects initial and pending caller cancellation, fences late data and preserves newer abort-callback work. */
export async function verifyCallerRequestCancellation(api: CoreApi): Promise<void> {
	for (const mode of ['submit', 'fetch'] as const) {
		let finish: ((value: string) => void) | undefined;
		let entered!: () => void;
		let calls = 0;
		let signal: AbortSignal | undefined;
		let newer: Promise<void> | undefined;
		const ready = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const router = api.createExactRouter({
			source: api.createMemoryLocationSource('/home'),
			routes: [
				{
					id: 'home',
					path: '/home',
					action: (args) => {
						calls++;
						if (calls > 1) return 'new';
						signal = args.signal;
						entered();
						return new Promise<string>((resolve) => {
							finish = resolve;
						});
					}
				}
			]
		});
		const invoke = (owner: AbortController) => {
			const init = { method: 'POST', signal: owner.signal };
			return mode === 'submit'
				? router.submit('/home', init)
				: router.fetch('owned', 'home', '/home', init);
		};
		let timeout: ReturnType<typeof setTimeout> | number | undefined;
		try {
			const initial = new AbortController();
			initial.abort(null);
			const before = router.getSnapshot();
			const rejected = await invoke(initial).then(
				() => false,
				(reason) => reason === null
			);
			check(
				rejected && calls === 0 && router.getSnapshot() === before,
				'initial caller cancellation rejects without dispatch or publication'
			);
			const owner = new AbortController();
			const pending = invoke(owner).then(
				() => false,
				(reason) => reason === null
			);
			await ready;
			signal!.addEventListener(
				'abort',
				() => {
					newer =
						mode === 'submit'
							? router.navigate('/next')
							: router.fetch('owned', 'home', '/home', { method: 'POST' });
				},
				{ once: true }
			);
			owner.abort(null);
			const outcome = await Promise.race([
				pending,
				new Promise<false>((resolve) => {
					timeout = setTimeout(() => resolve(false), 1000);
				})
			]);
			check(
				outcome && signal!.aborted && signal!.reason === null,
				'pending cancellation rejects promptly and cancels owned signal exactly'
			);
			await newer;
			finish?.('stale');
			await Promise.resolve();
			await Promise.resolve();
			const snapshot = router.getSnapshot();
			check(
				mode === 'submit'
					? snapshot.location.pathname === '/next' && Object.keys(snapshot.actionData).length === 0
					: snapshot.fetchers.get('owned')?.data === 'new',
				'late canceled work cannot retire or overwrite the newer owner'
			);
			await router.navigate('/after');
			check(
				router.getSnapshot().location.pathname === '/after',
				'router remains usable after caller cancellation'
			);
		} finally {
			clearTimeout(timeout);
			finish?.('cleanup');
			router.dispose();
		}
	}
}

/** Carries caller ownership through returned/thrown redirects, mutation revalidation and its redirects. */
export async function verifyDelegatedRequestCancellation(api: CoreApi): Promise<void> {
	for (const mode of [
		'submit-redirect',
		'submit-thrown-redirect',
		'fetch-redirect',
		'fetch-thrown-redirect',
		'fetch-revalidation',
		'fetch-revalidation-redirect',
		'submit-revalidation-redirect'
	]) {
		let finish!: () => void;
		let entered!: () => void;
		let signal: AbortSignal | undefined;
		const ready = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const pending = ({ signal: owned }: { signal: AbortSignal }) => {
			signal = owned;
			entered();
			return new Promise<string>((resolve) => {
				finish = () => resolve('late');
			});
		};
		const redirect = () => new Response(null, { status: 302, headers: { Location: '/next' } });
		const router = api.createExactRouter({
			source: api.createMemoryLocationSource('/home'),
			hydrationData: { loaderData: { home: 'initial' } },
			routes: [
				{
					id: 'home',
					path: '/home',
					action: () => {
						if (mode.includes('revalidation')) return 'saved';
						const response = redirect();
						if (mode.includes('thrown')) throw response;
						return response;
					},
					loader: mode.endsWith('revalidation-redirect') ? redirect : pending
				},
				{ id: 'next', path: '/next', loader: pending }
			]
		});
		const owner = new AbortController();
		try {
			const init = { method: 'POST', signal: owner.signal };
			const work = (
				mode.startsWith('submit')
					? router.submit('/home', init)
					: router.fetch('owned', 'home', '/home', init)
			).then(
				() => false,
				(reason) => reason === null
			);
			await ready;
			owner.abort(null);
			check(await work, mode + ' rejects exact caller cancellation');
			check(signal?.aborted === true && signal.reason === null, mode + ' cancels delegated loader');
			finish();
			await new Promise((resolve) => setTimeout(resolve, 0));
			const snapshot = router.getSnapshot();
			check(
				snapshot.location.pathname === '/home' &&
					snapshot.loaderData.home === 'initial' &&
					snapshot.navigation.state === 'idle' &&
					snapshot.revalidation === 'idle',
				mode + ' fences late data and settles pending state'
			);
			await router.navigate('/after');
			check(
				router.getSnapshot().location.pathname === '/after',
				mode + ' permits following live work'
			);
		} finally {
			finish?.();
			router.dispose();
		}
	}
}
