type RouterApi = Pick<
	typeof import('@exactjs/router'),
	'createExactRouter' | 'createMemoryLocationSource'
>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('Router navigation: ' + message);
}

/** Releases an authored publication gate in finally blocks so failed checks cannot strand work. */
function gate() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

/** Crosses direct and action-owned redirects with failure settlement, cancellation, and next work. */
export async function verifyRouterRedirectFailures(api: RouterApi): Promise<void> {
	for (const mode of ['navigate', 'returned', 'thrown', 'revalidation']) {
		const signals: AbortSignal[] = [];
		const redirect = () => new Response(null, { status: 302, headers: { Location: '/loop' } });
		let homeLoads = 0;
		const source = api.createMemoryLocationSource('/home');
		const router = api.createExactRouter({
			source,
			routes: [
				{
					id: 'home',
					path: '/home',
					loader: ({ signal }) => {
						signals.push(signal);
						return mode === 'revalidation' && homeLoads++ > 0 ? redirect() : 'home';
					}
				},
				{
					id: 'loop',
					path: '/loop',
					loader: ({ signal }) => {
						signals.push(signal);
						return redirect();
					},
					action: ({ signal }) => {
						signals.push(signal);
						if (mode === 'thrown') throw redirect();
						return redirect();
					}
				},
				{
					id: 'save',
					path: '/save',
					action: ({ signal }) => {
						signals.push(signal);
						return 'accepted';
					}
				},
				{ id: 'done', path: '/done', action: () => 'later' }
			]
		});
		try {
			await router.initialize();
			let error: unknown;
			try {
				await (mode === 'navigate'
					? router.navigate('/loop')
					: router.submit(mode === 'revalidation' ? '/save' : '/loop', { method: 'POST' }));
			} catch (caught) {
				error = caught;
			}
			check(
				error instanceof Error && /maximum redirect depth/.test(error.message),
				mode + ' preserves the delegated failure'
			);
			check(router.getSnapshot().navigation.state === 'idle', mode + ' settles navigation');
			check(source.location().pathname === '/home', 'failed redirects do not publish history');
			check(
				signals.every((signal) => signal.aborted),
				'failed work releases its signals'
			);
			if (mode === 'revalidation')
				check(
					router.getSnapshot().actionData.save === 'accepted',
					'a completed action is retained when its following revalidation fails'
				);
			await router.navigate('/done');
			await router.submit('/done', { method: 'POST' });
			check(
				router.getSnapshot().actionData.done === 'later' &&
					router.getSnapshot().navigation.state === 'idle',
				'subsequent navigation and submission progress'
			);
		} finally {
			router.dispose();
		}
	}
}

/** Keeps prepared route data private and rolls it back when history rejects an uncommitted write. */
export async function verifyRouterPublicationData(api: RouterApi): Promise<void> {
	for (const mode of ['held', 'held history', 'rejected', 'history', 'committed']) {
		const entered = gate();
		const finish = gate();
		const primary = new Error('publication rejected');
		const source = api.createMemoryLocationSource('/home');
		const push = source.push;
		let fail = mode === 'history' || mode === 'held history';
		source.push = (...args) => {
			if (fail) throw primary;
			push(...args);
		};
		const router = api.createExactRouter({
			source,
			routes: [
				{
					id: 'home',
					path: '/home',
					loader: () => new Response('home', { status: 202, headers: { 'X-Route': 'home' } })
				},
				{
					id: 'next',
					path: '/next',
					loader: () => new Response('next', { status: 201, headers: { 'X-Route': 'next' } })
				}
			],
			publication: {
				async publish(context) {
					entered.release();
					if (mode === 'held' || mode === 'held history') await finish.promise;
					if (mode === 'rejected') throw primary;
					context.publish();
					if (mode === 'committed') throw primary;
				}
			}
		});
		let pending: Promise<void> | undefined;
		try {
			await router.initialize();
			pending = router.navigate('/next');
			let error: unknown;
			if (mode === 'held' || mode === 'held history') {
				await entered.promise;
				router.sync();
				check(
					router.getSnapshot().loaderData.home === 'home' &&
						!('next' in router.getSnapshot().loaderData),
					'refresh cannot publish prepared data'
				);
				finish.release();
			}
			try {
				await pending;
			} catch (caught) {
				error = caught;
			}
			check(
				mode === 'held' ? error === undefined : error === primary,
				'publication preserves the primary outcome'
			);
			router.sync();
			const snapshot = router.getSnapshot();
			const accepted = mode === 'held' || mode === 'committed';
			const id = accepted ? 'next' : 'home';
			check(
				snapshot.location.pathname === '/' + id &&
					snapshot.loaderData[id] === id &&
					snapshot.loaderHeaders[id]?.get('X-Route') === id &&
					snapshot.statusCode === (accepted ? 201 : 202),
				'data, headers, status and location share publication ownership'
			);
			check(snapshot.navigation.state === 'idle', 'publication failure settles state');
			if (mode === 'history' || mode === 'held history') {
				fail = false;
				await router.navigate('/next');
				check(
					router.getSnapshot().loaderData.next === 'next',
					'a rejected history write can be followed by valid work'
				);
			}
		} finally {
			finish.release();
			await pending?.catch(() => {});
			router.dispose();
		}
	}
}

/** Rejecting older work cannot settle or cancel newer work, and cleanup cannot replace primary errors. */
export async function verifyRouterFailureOwnership(api: RouterApi): Promise<void> {
	const oldEntered = gate();
	const oldFinish = gate();
	const newEntered = gate();
	const newFinish = gate();
	const primary = new Error('older publication rejected');
	const router = api.createExactRouter({
		source: api.createMemoryLocationSource('/'),
		routes: [{ id: 'page', path: '/:id?' }],
		publication: {
			async publish(context) {
				if (context.metadata.to.pathname === '/old') {
					oldEntered.release();
					await oldFinish.promise;
					throw primary;
				}
				newEntered.release();
				await newFinish.promise;
				context.publish();
			}
		}
	});
	let old: Promise<unknown> | undefined;
	let current: Promise<void> | undefined;
	try {
		old = router.navigate('/old').catch((error) => error);
		await oldEntered.promise;
		current = router.navigate('/new');
		await newEntered.promise;
		oldFinish.release();
		check((await old) === primary, 'stale work retains its own failure');
		check(
			router.getSnapshot().navigation.state === 'loading' &&
				router.getSnapshot().navigation.location?.pathname === '/new',
			'stale failure preserves newer pending state'
		);
		newFinish.release();
		await current;
		check(
			router.getSnapshot().location.pathname === '/new' &&
				router.getSnapshot().navigation.state === 'idle',
			'new work can publish after an older rejection'
		);
	} finally {
		oldFinish.release();
		newFinish.release();
		await old;
		await current?.catch(() => {});
		router.dispose();
	}
	for (const error of [
		new Error('primary'),
		undefined,
		0,
		Object.freeze(new Error('frozen primary'))
	]) {
		const cleanup = new Error('idle observer failed');
		const owner = api.createExactRouter({
			source: api.createMemoryLocationSource('/'),
			routes: [],
			publication: {
				publish() {
					throw error;
				}
			}
		});
		const release = owner.subscribe(() => {
			if (owner.getSnapshot().navigation.state === 'idle') throw cleanup;
		});
		try {
			let rejected = false;
			let actual: unknown;
			try {
				await owner.navigate('/next');
			} catch (caught) {
				rejected = true;
				actual = caught;
			}
			check(
				rejected && actual === error && owner.getSnapshot().navigation.state === 'idle',
				'cleanup preserves even non-object primary failures'
			);
		} finally {
			release();
			owner.dispose();
		}
	}
}
