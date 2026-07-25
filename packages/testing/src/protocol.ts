import type { ExactClientOperationObservation, FetchLike } from '@exactjs/hydrate';
import type { ExactInvocationRequest, ExactPatch } from '@exactjs/server';

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
		events: unknown[];
	};
	clientOperations: ExactClientOperationObservation[];
};

/** Records the transport envelopes and client-side results observed by a test. */
export class ExactProtocolRecorder {
	readonly exchanges: ExactProtocolExchange[] = [];
	private pendingStreams = new Set<Promise<void>>();

	/** Wraps a fetch transport and records request, response, stream, and client-operation details. */
	wrap(fetch: FetchLike): FetchLike {
		return async (input, init) => {
			const requestBody = parseJson(init.body);
			const exchange: ExactProtocolExchange = {
				sequence: this.exchanges.length + 1,
				url: input,
				method: init.method,
				headers: Object.freeze({ ...init.headers }),
				rawRequestBody: init.body,
				requestBody,
				operations: operationsFrom(requestBody),
				clientOperations: []
			};
			this.exchanges.push(exchange);
			const response = await fetch(input, init);
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
					const body = await originalJson();
					responseRecord.body = body;
					return body;
				},
				async text() {
					const body = originalText ? await originalText() : JSON.stringify(await originalJson());
					responseRecord.rawBody = body;
					responseRecord.body = parseJson(body);
					return body;
				}
			};
			if (response.body) {
				const observed = observeStream(response.body, responseRecord.events, (raw) => {
					responseRecord.rawBody = raw;
				});
				this.pendingStreams.add(observed.done);
				void observed.done.finally(() => this.pendingStreams.delete(observed.done));
				wrapped.body = observed.stream;
			}
			return wrapped;
		};
	}

	/** Associates the hydrator's final DOM disposition with its recorded request. */
	observeClientOperation(observation: ExactClientOperationObservation): void {
		const exchange = [...this.exchanges]
			.reverse()
			.find((candidate) =>
				candidate.operations.some(
					(operation) =>
						operation.type === observation.operation.type &&
						operation.id === observation.operation.id
				)
			);
		if (!exchange)
			throw new Error(
				`No recorded protocol request contains ${observation.operation.type} operation ${observation.operation.id}`
			);
		exchange.clientOperations.push({
			...observation,
			appliedPatches: [...observation.appliedPatches]
		});
	}

	/** Waits until all response streams that the client consumed have completed. */
	async settle(): Promise<void> {
		while (this.pendingStreams.size) await Promise.allSettled([...this.pendingStreams]);
	}

	/** Discards recorded exchanges without affecting transports or pending stream observation. */
	clear(): void {
		this.exchanges.length = 0;
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
			'x-exact-stream'
		]) {
			const value = headers.get(name);
			if (value !== null) values[name] = value;
		}
		return values;
	}
	return { ...(headers as Readonly<Record<string, string>>) };
}

function observeStream(
	source: ReadableStream<Uint8Array>,
	events: unknown[],
	onComplete: (raw: string) => void
): { stream: ReadableStream<Uint8Array>; done: Promise<void> } {
	const [stream, observation] = source.tee();
	const done = (async () => {
		const reader = observation.getReader();
		const decoder = new TextDecoder();
		let raw = '';
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			raw += decoder.decode(next.value, { stream: true });
		}
		raw += decoder.decode();
		for (const line of raw.split(/\r?\n/)) {
			if (line.trim()) events.push(parseJson(line));
		}
		onComplete(raw);
	})();
	return { stream, done };
}
