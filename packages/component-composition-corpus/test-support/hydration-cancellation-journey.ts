import type { HydrateOptions } from '@exactjs/hydrate';
type Api = Pick<typeof import('@exactjs/hydrate'), 'createExactClient'> &
	Pick<typeof import('../../hydrate/src/response/ndjson.js'), 'readNdjsonEvents'>;

/** Checks exact client and wire-reader cancellation reasons without weakening malformed data rejection. */
export async function verifyHydrationCancellation(api: Api, document: Document): Promise<void> {
	const continuations: HydrateOptions['continuations'] = {
		job: {
			id: 'job',
			componentId: 'test:job',
			kind: 'task',
			readiness: 'nonblocking',
			dependencies: [],
			stateReads: [],
			stateWrites: [],
			publicContexts: [],
			serverContexts: [],
			contextWrites: [],
			boundaries: []
		}
	};
	for (const reason of [null, false, 0, new TypeError('owner cancelled')]) {
		const controller = new AbortController();
		let calls = 0;
		const client = api.createExactClient(document.createElement('main'), {
			endpoint: '/cancel',
			signal: controller.signal,
			continuations,
			fetch: async () => {
				calls++;
				throw new Error('unexpected fetch');
			}
		});
		try {
			const task = client.invokeTask('job').then(
				() => Symbol('not rejected'),
				(error) => error
			);
			controller.abort(reason);
			if ((await task) !== reason || calls !== 0)
				throw new Error('Client cancellation lost reason or dispatched work');
		} finally {
			client.dispose();
		}
		const owner = new AbortController();
		const stream = new ReadableStream<Uint8Array>();
		const reading = api.readNdjsonEvents(stream, 'invalid stream', () => {}, {
			signal: owner.signal
		});
		const caught = reading.then(
			() => Symbol('not rejected'),
			(error) => error
		);
		owner.abort(reason);
		if ((await caught) !== reason || stream.locked)
			throw new Error('Wire cancellation lost reason or reader lock');
	}
	const controller = new AbortController();
	const client = api.createExactClient(document.createElement('main'), {
		endpoint: '/cancel-fetch',
		signal: controller.signal,
		continuations,
		fetch: async () => {
			controller.abort('cancelled');
			throw new Error('late fetch failure');
		}
	});
	try {
		const caught = await client.invokeTask('job').then(
			() => Symbol('not rejected'),
			(error) => error
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		if (caught !== 'cancelled') throw new Error('Fetcher cancellation identity changed');
	} finally {
		client.dispose();
	}

	for (const bytes of [[0xff], [0xe2, 0x82]]) {
		const invalid = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array(bytes));
				controller.close();
			}
		});
		let failure: unknown;
		try {
			await api.readNdjsonEvents(invalid, 'invalid stream', () => {}, {});
		} catch (error) {
			failure = error;
		}
		if (!(failure instanceof Error) || failure.message !== 'invalid stream' || invalid.locked)
			throw new Error('Invalid UTF-8 rejection changed');
	}
	for (const failure of [
		undefined,
		new TypeError('receiver failed'),
		new Error('receiver failed')
	]) {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('{"value":1}\n'));
				controller.close();
			}
		});
		let caught: unknown = Symbol('not rejected');
		try {
			await api.readNdjsonEvents(
				stream,
				'invalid stream',
				() => {
					throw failure;
				},
				{}
			);
		} catch (error) {
			caught = error;
		}
		if (caught !== failure || stream.locked)
			throw new Error('Receiver failure lost identity or reader lock');
	}

	const seen: unknown[] = [];
	const valid = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode('{"value":1}\n'));
			controller.close();
		}
	});
	await api.readNdjsonEvents(
		valid,
		'invalid stream',
		(value) => {
			seen.push(value);
		},
		{}
	);
	if (seen.length !== 1 || valid.locked) throw new Error('Valid wire delivery changed');
}
