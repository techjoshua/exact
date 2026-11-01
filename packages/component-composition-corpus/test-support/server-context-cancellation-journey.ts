type ServerApi = typeof import('@exactjs/server');
type Api = {
	createExactContextRuntime: ServerApi['createExactContextRuntime'];
	runWithExactRequestScope<T>(
		request: Parameters<ServerApi['runWithExactRequestScope']>[0],
		server: Pick<
			Parameters<ServerApi['runWithExactRequestScope']>[1],
			'contextRuntime' | 'contract'
		>,
		work: () => T | Promise<T>
	): Promise<T>;
};

/** Checks exact initialization and retained stream cancellation through public request owners. */
export async function verifyServerContextCancellation(api: Api): Promise<void> {
	for (const reason of [null, false, 0, new TypeError('request cancelled')]) {
		const controller = new AbortController();
		let started!: () => void;
		const entered = new Promise<void>((resolve) => {
			started = resolve;
		});
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const runtime = api.createExactContextRuntime({
			requestContexts: async () => {
				started();
				await gate;
				return [];
			}
		});
		const opening = runtime.open({
			method: 'GET',
			url: 'http://localhost/cancel',
			headers: {},
			signal: controller.signal
		});
		const caught = opening.then(
			() => Symbol('not rejected'),
			(error) => error
		);
		try {
			await entered;
			controller.abort(reason);
			if ((await caught) !== reason)
				throw new Error('Request initialization lost cancellation reason');
		} finally {
			release();
			await runtime.dispose();
		}

		const owner = new AbortController();
		const streamRuntime = api.createExactContextRuntime();
		const context = {
			contextRuntime: streamRuntime,
			contract: { version: 1 as const, invocations: {}, executors: {}, boundaries: {} }
		};
		let cancelled: unknown = Symbol('not cancelled');
		const response = await api.runWithExactRequestScope(
			{ method: 'GET', url: 'http://localhost/stream', headers: {}, signal: owner.signal },
			context,
			() => ({
				status: 200,
				headers: {},
				stream: new ReadableStream<Uint8Array>({
					cancel(value) {
						cancelled = value;
					}
				})
			})
		);
		const reader = response.stream.getReader();
		try {
			const pending = reader.read().then(
				() => Symbol('not rejected'),
				(error) => error
			);
			owner.abort(reason);
			if ((await pending) !== reason || cancelled !== reason)
				throw new Error('Retained request stream lost cancellation reason');
		} finally {
			reader.releaseLock();
			await streamRuntime.dispose();
		}
	}
	for (const mode of ['pre-aborted', 'factory-aborted']) {
		const controller = new AbortController();
		let calls = 0;
		if (mode === 'pre-aborted') controller.abort('cancelled');
		const runtime = api.createExactContextRuntime({
			requestContexts: async () => {
				calls++;
				controller.abort('cancelled');
				throw new Error('late initialization failed');
			}
		});
		try {
			let caught: unknown;
			try {
				await runtime.open({
					method: 'GET',
					url: 'http://localhost/pre',
					headers: {},
					signal: controller.signal
				});
			} catch (error) {
				caught = error;
			}
			await new Promise((resolve) => setTimeout(resolve, 0));
			if (caught !== 'cancelled' || calls !== (mode === 'pre-aborted' ? 0 : 1))
				throw new Error('Canceled initialization ordering changed');
		} finally {
			await runtime.dispose();
		}
	}

	const runtime = api.createExactContextRuntime();
	try {
		const opened = await runtime.open({
			method: 'GET',
			url: 'http://localhost/ready',
			headers: {}
		});
		if (opened.request.signal.aborted) throw new Error('Successful request was canceled');
		await opened.dispose();
	} finally {
		await runtime.dispose();
	}
}
