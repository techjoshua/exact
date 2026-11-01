import type { ExactDataFunctionArgs } from '@exactjs/router';

type Api = Pick<
	typeof import('@exactjs/router'),
	'createExactRouter' | 'createMemoryLocationSource'
>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('Router operation ownership: ' + message);
}

/** Starts newer navigation from an old abort callback without allowing the interrupted call to publish. */
export async function verifyNavigationAbortOwnership(api: Api): Promise<void> {
	for (const method of ['navigate', 'submit', 'initialize']) {
		let finish!: () => void;
		let entered!: () => void;
		const gate = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const ready = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const calls: string[] = [];
		let newer: Promise<void> | undefined;
		async function oldHandler({ signal }: ExactDataFunctionArgs) {
			calls.push('old');
			signal.addEventListener(
				'abort',
				() => {
					newer = router.navigate('/new');
				},
				{ once: true }
			);
			entered();
			await gate;
			return 'old';
		}
		const middle = () => {
			calls.push('middle');
			return 'middle';
		};
		const router = api.createExactRouter({
			source: api.createMemoryLocationSource(method === 'initialize' ? '/old' : '/home'),
			routes: [
				{
					id: 'old',
					path: '/old',
					loader: oldHandler,
					action: oldHandler
				},
				{
					id: 'middle',
					path: '/middle',
					loader: middle,
					action: middle
				},
				{
					id: 'new',
					path: '/new',
					loader: () => {
						calls.push('new');
						return 'new';
					}
				}
			]
		});
		let old: Promise<void> | undefined;
		try {
			old =
				method === 'initialize'
					? router.initialize()
					: method === 'submit'
						? router.submit('/old', { method: 'POST' })
						: router.navigate('/old');
			await ready;
			await (method === 'initialize'
				? router.initialize()
				: method === 'submit'
					? router.submit('/middle', { method: 'POST' })
					: router.navigate('/middle'));
			await newer;
			finish();
			await old;
			check(
				calls.join(',') === 'old,new' && router.getSnapshot().location.pathname === '/new',
				'abort-triggered newer navigation owns execution and publication'
			);
			await router.navigate('/middle');
			check(
				router.getSnapshot().location.pathname === '/middle',
				'following navigation progresses normally'
			);
		} finally {
			finish();
			await old;
			await newer;
			router.dispose();
		}
	}
}

/** Preserves newer independent revalidation when an older cancellation callback starts it. */
export async function verifyRevalidationAbortOwnership(api: Api): Promise<void> {
	let finish!: () => void;
	let entered!: () => void;
	const gate = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const ready = new Promise<void>((resolve) => {
		entered = resolve;
	});
	let calls = 0;
	let newer: Promise<void> | undefined;
	const router = api.createExactRouter({
		source: api.createMemoryLocationSource('/home'),
		routes: [
			{
				id: 'home',
				path: '/home',
				loader: async ({ signal }: ExactDataFunctionArgs) => {
					calls++;
					if (calls === 1) return 'initial';
					if (calls === 2) {
						signal.addEventListener(
							'abort',
							() => {
								newer = router.revalidate();
							},
							{ once: true }
						);
						entered();
						await gate;
						return 'old';
					}
					return calls === 3 ? 'newer' : 'following';
				}
			}
		]
	});
	let old: Promise<void> | undefined;
	try {
		await router.initialize();
		old = router.revalidate();
		await ready;
		await router.revalidate();
		await newer;
		finish();
		await old;
		check(
			calls === 3 &&
				router.getSnapshot().loaderData.home === 'newer' &&
				router.getSnapshot().revalidation === 'idle',
			'only newest revalidation executes and settles'
		);
		await router.revalidate();
		check(
			router.getSnapshot().loaderData.home === 'following',
			'following revalidation progresses normally'
		);
	} finally {
		finish();
		await old;
		await newer;
		router.dispose();
	}
}
