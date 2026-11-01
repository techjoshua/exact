interface Scheduler {
	run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

/** Checks the real scheduler constructor's cancellation boundary and permit recovery. */
export async function verifySsrSchedulerGrant(
	Scheduler: new (limit: number) => Scheduler
): Promise<void> {
	for (const reason of [null, 'cancelled after grant']) {
		const scheduler = new Scheduler(1);
		let release!: () => void;
		const running = scheduler.run(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		);
		const controller = new AbortController();
		let starts = 0;
		const waiting = scheduler.run(async () => {
			starts++;
			return 'cancelled';
		}, controller.signal);
		const caught = waiting.then(
			() => Symbol('not rejected'),
			(error) => error
		);
		release();
		queueMicrotask(() => controller.abort(reason));
		await running;
		if ((await caught) !== reason || starts !== 0)
			throw new Error('Canceled SSR work started after permit grant');
		if ((await scheduler.run(async () => 'ready')) !== 'ready')
			throw new Error('SSR cancellation leaked permit');
	}
}
