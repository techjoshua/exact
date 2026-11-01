type Api = {
	dispatchExactBatch: typeof import('../../server/src/streaming.js').dispatchExactBatch;
	readBody(request: {
		method: string;
		bodyStream: ReadableStream<Uint8Array>;
		signal: AbortSignal;
	}): Promise<unknown>;
	createProgressStream: typeof import('../../server/src/progress/stream.js').createProgressStream;
};

/** Keeps exact cancellation across request reads, progress readers and pending producer writes. */
export async function verifyServerStreamCancellation(api: Api): Promise<void> {
	await verifyBatchCancellation(api);
	for (const reason of [null, false, 0, 'cancelled', new TypeError('cancelled')]) {
		for (const preAborted of [true, false]) {
			const owner = new AbortController();
			let cancelled: unknown = Symbol('not cancelled');
			const body = new ReadableStream<Uint8Array>({
				cancel(value) {
					cancelled = value;
				}
			});
			if (preAborted) owner.abort(reason);
			const reading = api.readBody({ method: 'POST', bodyStream: body, signal: owner.signal }).then(
				() => Symbol('not rejected'),
				(error) => error
			);
			if (!preAborted) owner.abort(reason);
			if ((await reading) !== reason || cancelled !== reason || body.locked)
				throw new Error('Request body lost cancellation ownership');
		}
		const owner = new AbortController();
		let entered!: () => void;
		const pending = new Promise<void>((resolve) => {
			entered = resolve;
		});
		let finished!: () => void;
		const production = new Promise<void>((resolve) => {
			finished = resolve;
		});
		let producerFailure: unknown = Symbol('not rejected');
		let lateFailure: unknown = Symbol('not rejected');
		let cancelled: unknown = Symbol('not cancelled');
		let disposed = 0;
		const stream = api.createProgressStream(
			async (writer) => {
				entered();
				try {
					await writer.emit({ event: 'complete', version: 1 });
				} catch (error) {
					producerFailure = error;
				}
				try {
					await writer.emit({ event: 'complete', version: 1 });
				} catch (error) {
					lateFailure = error;
				}
				finished();
			},
			{
				signal: owner.signal,
				cancel(value) {
					cancelled = value;
				},
				dispose() {
					disposed++;
				}
			}
		);
		await pending;
		owner.abort(reason);
		let failure: unknown = Symbol('not rejected');
		const reader = stream.getReader();
		try {
			await reader.read();
		} catch (error) {
			failure = error;
		} finally {
			reader.releaseLock();
		}
		await production;
		if (
			failure !== reason ||
			producerFailure !== reason ||
			lateFailure !== reason ||
			cancelled !== reason ||
			disposed !== 1
		)
			throw new Error('Progress stream lost exact cancellation ownership');
	}
	for (const mode of ['signal', 'reader', 'pre-aborted']) {
		const owner = new AbortController();
		if (mode === 'pre-aborted') owner.abort(null);
		let runs = 0;
		let disposals = 0;
		const stream = api.createProgressStream(
			async () => {
				runs++;
			},
			{
				signal: owner.signal,
				cancel(reason) {
					owner.abort(reason);
				},
				dispose() {
					disposals++;
				}
			}
		);
		if (mode === 'signal') owner.abort(null);
		await stream.cancel(null).catch(() => undefined);
		if (runs !== 0 || disposals !== 1)
			throw new Error('Cancelled queued progress producer ran after disposal');
	}
}

/** Fences dependent operations at cancellation while retaining the caller's exact reason. */
export async function verifyBatchCancellation(api: Pick<Api, 'dispatchExactBatch'>): Promise<void> {
	for (const reason of [null, false, 0, 'cancelled', new Error('cancelled')]) {
		for (const preAborted of [true, false]) {
			const owner = new AbortController();
			if (preAborted) owner.abort(reason);
			const dispatched: string[] = [];
			let caught: unknown = Symbol('not rejected');
			try {
				await api.dispatchExactBatch(
					{ method: 'POST', signal: owner.signal },
					[
						{ type: 'invoke', id: 'first', opId: 'first' },
						{ type: 'invoke', id: 'next', dependsOn: ['first'] }
					],
					{ contract: { version: 1, invocations: {}, boundaries: {} } },
					async (_request, operation) => {
						dispatched.push(operation.id);
						owner.abort(reason);
						return { ok: true, type: operation.type, id: operation.id };
					}
				);
			} catch (error) {
				caught = error;
			}
			if (caught !== reason || dispatched.join() !== (preAborted ? '' : 'first'))
				throw new Error('Batch cancellation lost ownership or dispatched a dependent operation');
		}
	}
}
