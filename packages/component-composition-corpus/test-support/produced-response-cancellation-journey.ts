type Api = Pick<
	typeof import('@exactjs/server'),
	'createExactProducedResponse' | 'createExactAsyncProducedResponse'
>;

/** Retains exact cancellation reasons through synchronous and asynchronous body ownership. */
export async function verifyProducedResponseCancellation(api: Api): Promise<void> {
	for (const reason of [null, false, 0, 'cancelled', new Error('cancelled')]) {
		for (const asynchronous of [false, true]) {
			for (const scoped of [false, true]) {
				let released: unknown = Symbol('not released');
				let releases = 0;
				const owner = new AbortController();
				const response = asynchronous
					? api.createExactAsyncProducedResponse(200, {}, async () => {})
					: api.createExactProducedResponse(200, {}, () => {});
				response.body.retainRequestScope!(
					async (value) => {
						released = value;
						releases++;
					},
					scoped ? owner.signal : undefined
				);
				if (scoped) owner.abort(reason);
				await response.body.cancel(reason);
				if (released !== reason || releases !== 1)
					throw new Error('Produced response scope lost cancellation reason');
			}
		}
		const owner = new AbortController();
		let entered!: () => void;
		const blocked = new Promise<void>((resolve) => {
			entered = resolve;
		});
		let released: unknown = Symbol('not released');
		let producerFailure: unknown = Symbol('not rejected');
		const response = api.createExactAsyncProducedResponse(200, {}, async (write) => {
			await write('first');
			entered();
			try {
				await write('second');
			} catch (error) {
				producerFailure = error;
				throw error;
			}
		});
		response.body.retainRequestScope!(async (value) => {
			released = value;
		}, owner.signal);
		const reader = response.body.toReadableStream().getReader();
		try {
			await reader.read();
			await blocked;
			owner.abort(reason);
			let caught: unknown = Symbol('not rejected');
			try {
				await reader.read();
			} catch (error) {
				caught = error;
			}
			await response.body.cancel(reason);
			if (caught !== reason || producerFailure !== reason || released !== reason)
				throw new Error('Demand-blocked response lost cancellation reason');
		} finally {
			reader.releaseLock();
			await response.body.cancel(reason);
		}
	}
	const response = api.createExactAsyncProducedResponse(200, {}, async (write) => {
		await write('ready');
	});
	if ((await new Response(response.body.toReadableStream()).text()) !== 'ready')
		throw new Error('Produced response success changed');
}
