import {
	attachExactObservationOwner,
	readExactObservationOwner
} from '@exactjs/core/framework/inspection-transport';
import type { ExactClientOperationObservation, FetchLike } from '@exactjs/hydrate';
import type {
	ExactInvocationRequest,
	ExactPatch,
	ExactServerContextAccessObservation
} from '@exactjs/server';

/** Captures one real client/server protocol exchange without interpreting generated IDs. */
export type ExactProtocolExchange = {
	readonly sequence: number;
	readonly url: string;
	readonly method: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly rawRequestBody: string;
	readonly requestBody: unknown;
	readonly operations: readonly ExactInvocationRequest[];
	response?: {
		status: number;
		headers: Readonly<Record<string, string>>;
		rawBody?: string;
		body?: unknown;
		/** Complete consumed protocol lines, appended while the response is still streaming. */
		events: unknown[];
	};
	clientOperations: ExactClientOperationObservation[];
	serverContextAccesses: ExactServerContextAccessObservation[];
};

/** Records the transport envelopes and client-side results observed by a test. */
export class ExactProtocolRecorder {
	readonly exchanges: ExactProtocolExchange[] = [];
	private observationOwners = new WeakMap<object, ExactProtocolExchange>();
	private pendingStreams = new Set<Promise<void>>();

	/** Wraps a fetch transport and records request, response, stream, and client-operation details. */
	wrap(fetch: FetchLike): FetchLike {
		return async (input, init) => {
			const requestBody = parseJson(init.body);
			const exchange: ExactProtocolExchange = {
				sequence: this.exchanges.length + 1,
				url: input,
				method: init.method,
				headers: { ...init.headers },
				rawRequestBody: init.body,
				requestBody,
				operations: operationsFrom(requestBody),
				clientOperations: [],
				serverContextAccesses: []
			};
			this.exchanges.push(exchange);
			const owner = {};
			this.observationOwners.set(owner, exchange);
			const response = await fetch(input, attachExactObservationOwner({ ...init }, owner));
			const responseRecord = {
				status: response.status,
				headers: normalizeHeaders(response.headers),
				events: [] as unknown[],
				rawBody: undefined as string | undefined,
				body: undefined as unknown
			};
			exchange.response = responseRecord;
			const originalJson = response.json.bind(response);
			const originalText = response.text?.bind(response);
			const wrapped = {
				ok: response.ok,
				status: response.status,
				headers: response.headers,
				body: response.body,
				async json() {
					const body = wrapped.body
						? await new Response(wrapped.body).json()
						: await originalJson();
					responseRecord.body = body;
					return body;
				},
				async text() {
					const body = wrapped.body
						? await new Response(wrapped.body).text()
						: originalText
							? await originalText()
							: JSON.stringify(await originalJson());
					responseRecord.rawBody = body;
					responseRecord.body = parseJson(body);
					return body;
				}
			};
			if (response.body) {
				wrapped.body = observeStream(
					response.body,
					responseRecord.events,
					(raw) => {
						responseRecord.rawBody = raw;
						if (responseRecord.headers['content-type']?.includes('application/json'))
							responseRecord.body = parseJson(raw);
					},
					(done) => {
						this.pendingStreams.add(done);
						void done.finally(() => this.pendingStreams.delete(done));
					}
				);
			}
			return attachExactObservationOwner(wrapped, owner);
		};
	}

	/** Associates value-free context use with its request. Transport observations carry exact ownership, while manually supplied observations use the latest matching operation. */
	observeServerContextAccess(observation: ExactServerContextAccessObservation): void {
		const exchange = this.observedExchange(observation, observation.operationId);
		if (!exchange) return;
		exchange.serverContextAccesses.push({ ...observation });
	}

	/** Associates the hydrator's final DOM disposition with its request. Transport observations carry exact ownership, while manually supplied observations use the latest matching operation. */
	observeClientOperation(observation: ExactClientOperationObservation): void {
		const exchange = this.observedExchange(
			observation.operation,
			observation.operation.id,
			observation.operation.type
		);
		if (!exchange) return;
		exchange.clientOperations.push({
			...observation,
			appliedPatches: [...observation.appliedPatches]
		});
	}

	/** Uses request ownership directly. Legacy manually supplied observations retain latest-match behavior. */
	private observedExchange(
		observation: object,
		id: string,
		type?: ExactInvocationRequest['type']
	): ExactProtocolExchange | undefined {
		const owner = readExactObservationOwner(observation);
		if (owner) return this.observationOwners.get(owner);
		for (let index = this.exchanges.length - 1; index >= 0; index--) {
			const candidate = this.exchanges[index]!;
			if (
				candidate.operations.some(
					(operation) => operation.id === id && (!type || operation.type === type)
				)
			)
				return candidate;
		}
		throw new Error(
			`No recorded protocol request contains ${type ? `${type} ` : ''}operation ${id}`
		);
	}

	/** Waits for started response reads and cancellations, without draining unread bodies. */
	async settle(): Promise<void> {
		while (this.pendingStreams.size) await Promise.allSettled([...this.pendingStreams]);
	}

	/** Discards recorded exchanges without affecting transports or pending stream reads. Later observations from cleared requests are discarded. */
	clear(): void {
		this.exchanges.length = 0;
		this.observationOwners = new WeakMap();
	}

	/** Flattens the generated invocation operations observed across all recorded exchanges. */
	operations(): ExactInvocationRequest[] {
		return this.exchanges.flatMap((exchange) => exchange.operations);
	}

	/** Flattens the patches that the client actually applied after protocol responses. */
	appliedPatches(): ExactPatch[] {
		return this.exchanges.flatMap((exchange) =>
			exchange.clientOperations.flatMap((operation) => operation.appliedPatches)
		);
	}

	/** Flattens server-owned context tokens used during recorded operations without their values. */
	serverContextAccesses(): ExactServerContextAccessObservation[] {
		return this.exchanges.flatMap((exchange) => exchange.serverContextAccesses);
	}
}

function operationsFrom(body: unknown): ExactInvocationRequest[] {
	if (!body || typeof body !== 'object') return [];
	if ('operations' in body && Array.isArray(body.operations))
		return body.operations as ExactInvocationRequest[];
	if ('type' in body && 'id' in body) return [body as ExactInvocationRequest];
	return [];
}

function parseJson(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function normalizeHeaders(
	headers: { get(name: string): string | null } | Readonly<Record<string, string>> | undefined
): Readonly<Record<string, string>> {
	if (!headers) return {};
	if ('get' in headers && typeof headers.get === 'function') {
		const values: Record<string, string> = {};
		for (const name of [
			'content-type',
			'x-exact-build',
			'x-exact-preferred-build',
			'x-exact-stream',
			'x-exact-progress'
		]) {
			const value = headers.get(name);
			if (value !== null) values[name] = value;
		}
		return values;
	}
	return Object.fromEntries(
		Object.entries(headers as Readonly<Record<string, string>>).map(([name, value]) => [
			name.toLowerCase(),
			value
		])
	);
}

/** Observes consumed bytes while preserving source backpressure, errors, and cancellation. */
function observeStream(
	source: ReadableStream<Uint8Array>,
	events: unknown[],
	onComplete: (raw: string) => void,
	onStart: (done: Promise<void>) => void
): ReadableStream<Uint8Array> {
	const reader = source.getReader();
	const decoder = new TextDecoder();
	let raw = '';
	let pendingLine = '';
	const record = (text: string, final = false) => {
		raw += text;
		pendingLine += text;
		let newline: number;
		while ((newline = pendingLine.indexOf('\n')) !== -1) {
			const line = pendingLine.slice(0, newline);
			pendingLine = pendingLine.slice(newline + 1);
			if (line.trim()) events.push(parseJson(line));
		}
		if (final && pendingLine.trim()) events.push(parseJson(pendingLine));
		if (final) pendingLine = '';
	};
	let finished = false;
	let canceled = false;
	let resolveDone!: () => void;
	const done = new Promise<void>((resolve) => {
		resolveDone = resolve;
	});
	let started = false;
	const start = () => {
		if (started) return;
		started = true;
		onStart(done);
	};
	const finish = () => {
		if (finished) return;
		finished = true;
		reader.releaseLock();
		resolveDone();
	};
	// Observe only consumer reads. A tee would drain independently and prevent cancellation
	// from reaching the source while the observation branch remained open.
	const stream = new ReadableStream<Uint8Array>(
		{
			async pull(controller) {
				start();
				try {
					const next = await reader.read();
					if (finished || canceled) return;
					if (next.done) {
						record(decoder.decode(), true);
						onComplete(raw);
						controller.close();
						finish();
					} else {
						record(decoder.decode(next.value, { stream: true }));
						controller.enqueue(next.value);
					}
				} catch (error) {
					if (finished) return;
					controller.error(error);
					finish();
				}
			},
			async cancel(reason) {
				start();
				canceled = true;
				try {
					await reader.cancel(reason);
				} finally {
					finish();
				}
			}
		},
		{ highWaterMark: 0 }
	);
	return stream;
}
