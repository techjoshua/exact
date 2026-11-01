type Handler = ReturnType<typeof import('@exactjs/server').createExpressHandler>;

/** Cancels an Express response before or during drain waiting and observes transport cleanup. */
export async function verifyExpressCancellation(createHandler: () => Handler): Promise<void> {
	for (const reason of [null, false, 0, 'cancelled', new TypeError('cancelled')]) {
		for (const duringWrite of [true, false]) {
			const owner = new AbortController();
			const listeners = new Map<string, () => void>();
			let entered!: () => void;
			const draining = new Promise<void>((resolve) => {
				entered = resolve;
			});
			let finish!: (error: unknown) => void;
			const destroyed = new Promise<unknown>((resolve) => {
				finish = resolve;
			});
			let cleaned!: () => void;
			const cleanup = new Promise<void>((resolve) => {
				cleaned = resolve;
			});
			createHandler()(
				{
					method: 'POST',
					headers: { accept: 'application/x-ndjson' },
					body: { type: 'invoke', id: 'probe' },
					signal: owner.signal
				},
				{
					status() {
						return this;
					},
					setHeader() {},
					send() {
						throw new Error('Stream was buffered');
					},
					end() {
						throw new Error('Cancelled response completed');
					},
					write() {
						if (duringWrite) owner.abort(reason);
						return false;
					},
					destroy(error) {
						finish(error);
					},
					once(event, listener) {
						listeners.set(event, listener);
						if (event === 'drain') entered();
					},
					off(event) {
						listeners.delete(event);
						if (event === 'close') cleaned();
					}
				}
			);
			if (!duringWrite) {
				await draining;
				owner.abort(reason);
			}
			const error = await destroyed;
			await cleanup;
			if (error !== reason || listeners.size)
				throw new Error('Express drain lost cancellation ownership');
		}
	}
}
