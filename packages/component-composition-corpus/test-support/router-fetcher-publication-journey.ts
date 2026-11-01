import type { ExactDataFunctionArgs } from '@exactjs/router';
type Api = Pick<
	typeof import('@exactjs/router'),
	'createExactRouter' | 'createMemoryLocationSource'
>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('Fetcher publication: ' + message);
}

/** Retires or replaces fetcher work synchronously at loading publication, before handler selection. */
export async function verifyFetcherPublication(api: Api): Promise<void> {
	for (const method of ['GET', 'POST'])
		for (const lazy of [false, true])
			for (const transition of ['release', 'dispose', 'replace']) {
				const calls: string[] = [];
				let changed = false;
				let newer: Promise<void> | undefined;
				const handler = () => {
					calls.push('old');
					return 'old';
				};
				const router = api.createExactRouter({
					source: api.createMemoryLocationSource('/home'),
					routes: [
						{
							id: 'old',
							path: '/old',
							...(lazy
								? {
										lazy: async () => {
											calls.push('lazy');
											return { loader: handler, action: handler };
										}
									}
								: { loader: handler, action: handler })
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
				try {
					router.subscribe(() => {
						if (changed || router.getSnapshot().fetchers.get('key')?.state === 'idle') return;
						changed = true;
						if (transition === 'release') router.releaseFetcher('key');
						if (transition === 'dispose') router.dispose();
						if (transition === 'replace') newer = router.fetch('key', 'new', '/new');
					});
					await router.fetch('key', 'old', '/old', { method });
					await newer;
					check(
						!calls.includes('old') && !calls.includes('lazy'),
						'retired publication starts neither lazy materialization nor handlers'
					);
					if (transition === 'dispose') {
						let rejected = false;
						try {
							await router.fetch('key', 'new', '/new');
						} catch {
							rejected = true;
						}
						check(rejected, 'disposed owner rejects following work');
					} else {
						if (transition === 'release') {
							check(
								!router.getSnapshot().fetchers.has('key'),
								'released key is not recreated by old work'
							);
							await router.fetch('key', 'new', '/new');
						}
						check(
							calls.join(',') === 'new' && router.getSnapshot().fetchers.get('key')?.data === 'new',
							'new work runs and publishes independently of the retired call'
						);
					}
				} finally {
					router.dispose();
				}
			}
}

/** Starts newer work inside an older operation's abort callback without losing the newer owner. */
export async function verifyFetcherAbortReplacement(api: Api): Promise<void> {
	for (const transition of ['replace', 'release']) {
		let finish!: () => void;
		let entered!: () => void;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const gate = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const calls: string[] = [];
		let newer: Promise<void> | undefined;
		const router = api.createExactRouter({
			source: api.createMemoryLocationSource('/home'),
			routes: [
				{
					id: 'old',
					path: '/old',
					loader: async ({ signal }: ExactDataFunctionArgs) => {
						calls.push('old');
						signal.addEventListener(
							'abort',
							() => {
								newer = router.fetch('key', 'new', '/new');
							},
							{ once: true }
						);
						entered();
						await gate;
						return 'old';
					}
				},
				{
					id: 'middle',
					path: '/middle',
					loader: () => {
						calls.push('middle');
						return 'middle';
					}
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
		try {
			const old = router.fetch('key', 'old', '/old');
			await started;
			if (transition === 'replace') await router.fetch('key', 'middle', '/middle');
			else router.releaseFetcher('key');
			await newer;
			finish();
			await old;
			check(
				calls.join(',') === 'old,new' && router.getSnapshot().fetchers.get('key')?.data === 'new',
				'abort-triggered newer work survives old replacement and cleanup'
			);
		} finally {
			finish();
			router.dispose();
		}
	}
}

/** Preserves publication failures while releasing only their own operation and allowing following work. */
export async function verifyFetcherPublicationFailure(api: Api): Promise<void> {
	for (const transition of ['release', 'replace', 'dispose'])
		for (const primary of [
			new Error('publication failed'),
			Object.freeze(new Error('frozen failure')),
			null,
			undefined
		]) {
			let phase = 0;
			let oldCalls = 0;
			let newer: Promise<void> | undefined;
			const router = api.createExactRouter({
				source: api.createMemoryLocationSource('/home'),
				routes: [
					{
						id: 'old',
						path: '/old',
						lazy: async () => {
							oldCalls++;
							return { loader: () => 'old' };
						}
					},
					{ id: 'new', path: '/new', loader: () => 'new' }
				]
			});
			try {
				router.subscribe(() => {
					if (phase === 0 && router.getSnapshot().fetchers.get('key')?.state === 'loading') {
						phase = 1;
						if (transition === 'replace') newer = router.fetch('key', 'new', '/new');
						if (transition === 'dispose') router.dispose();
						throw primary;
					}
					if (phase === 1 && !router.getSnapshot().fetchers.has('key')) {
						phase = 2;
						throw new Error('cleanup notification failed');
					}
				});
				const outcome = await router.fetch('key', 'old', '/old').then(
					() => ({ rejected: false, error: undefined }),
					(error) => ({ rejected: true, error })
				);
				await newer;
				check(
					outcome.rejected && Object.is(outcome.error, primary),
					'original thrown value survives cleanup and ownership changes'
				);
				check(oldCalls === 0, 'failed publication starts no lazy work');
				if (transition === 'replace')
					check(
						router.getSnapshot().fetchers.get('key')?.data === 'new',
						'failed older notification leaves replacement intact'
					);
				if (transition === 'release') {
					check(
						!router.getSnapshot().fetchers.has('key'),
						'failed publication releases its own key'
					);
					await router.fetch('key', 'new', '/new');
					check(
						router.getSnapshot().fetchers.get('key')?.data === 'new',
						'following operation can publish'
					);
				}
			} finally {
				router.dispose();
			}
		}
}
