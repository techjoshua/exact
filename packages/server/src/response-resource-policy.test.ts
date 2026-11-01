import { describe, expect, it } from 'vitest';
import { createProgressStream } from '../../../packages/server/src/progress/stream.js';
import { copyGatewayResponse } from '../../../packages/server/src/gateway/response.js';
import { handleExactRequest } from '../../../packages/server/src/runtime/request-handler.js';
import { context as executionContext } from '../../../packages/server/src/test-support/server.js';
import { limitedJsonResponse } from '../../../packages/server/src/operations.js';
import { isInvocationResultSafe } from '../../../packages/server/src/validation.js';
import { captureProgressSnapshot } from '../../../packages/server/src/progress/snapshot.js';
import { isJsonSafe as serverJsonSafe } from '../../../packages/server/src/protocol.js';
import { readNdjsonEvents } from '../../../packages/hydrate/src/response/ndjson.js';
import { invokeExact } from '../../../packages/hydrate/src/invocations.js';
import { readExactStreamResponse } from '../../../packages/hydrate/src/response/stream.js';
import {
	encodeReactiveProtocolValue,
	decodeReactiveProtocolValue
} from '../../../packages/reactive/src/protocol.js';
import type { Logger, LogEvent } from '../../../packages/core/src/logging.js';
import type { ExactServerContext } from '../../../packages/server/src/types.js';

function logs() {
	const events: LogEvent[] = [];
	const logger: Logger = { log: (event) => events.push(event) };
	return { events, logger };
}
function context(extra: Partial<ExactServerContext> = {}): ExactServerContext {
	return { contract: { version: 1, invocations: {}, executors: {}, boundaries: {} }, ...extra };
}
function stream(chunks: Uint8Array[], cancelled: (reason: unknown) => void = () => {}) {
	return new ReadableStream<Uint8Array>({
		start(c) {
			for (const chunk of chunks) c.enqueue(chunk);
			c.close();
		},
		cancel: cancelled
	});
}
function wire(value: unknown) {
	return new TextEncoder().encode(JSON.stringify(value) + '\n');
}
async function collect(body: ReadableStream<Uint8Array>) {
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	try {
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			chunks.push(next.value);
		}
	} finally {
		reader.releaseLock();
	}
	return chunks;
}
function nested(depth: number): unknown {
	let value: unknown = 'end';
	for (let i = 0; i < depth; i++) value = { child: value };
	return value;
}
const complete = { event: 'complete', version: 1 } as const;

describe('selected configurable response resource policy', () => {
	it('preserves a real >16MiB Unicode result through buffered producer, client, stream and relay with one warning per setting', async () => {
		const value = 'é'.repeat(8 * 1024 * 1024 + 8);
		const server = logs();
		const response = limitedJsonResponse(context({ logger: server.logger }), 200, {
			ok: true,
			type: 'invoke',
			id: 'save',
			value
		});
		expect(new TextEncoder().encode(response.body).byteLength).toBeGreaterThan(16 * 1024 * 1024);
		expect(server.events.filter((x) => x.scope.category === 'response-resource')).toHaveLength(1);
		const client = logs();
		const result = await invokeExact({
			endpoint: '/exact',
			type: 'invoke',
			id: 'save',
			logger: client.logger,
			fetch: async () => ({
				ok: true,
				status: 200,
				text: async () => response.body,
				json: async () => JSON.parse(response.body)
			})
		});
		expect(result.value).toBe(value);
		expect(client.events.filter((x) => x.scope.category === 'response-resource')).toHaveLength(1);
		const producerLog = logs();
		let disposed = 0;
		const output = createProgressStream(
			async (writer) => {
				await writer.emit({ event: 'start', version: 1, operations: 1 });
				await writer.emit({
					event: 'result',
					version: 1,
					index: 0,
					result: { ok: true, type: 'invoke', id: 'save', value }
				});
				await writer.emit(complete);
			},
			{
				signal: new AbortController().signal,
				cancel() {},
				dispose() {
					disposed++;
				},
				logger: producerLog.logger
			}
		);
		const chunks = await collect(output);
		expect(disposed).toBe(1);
		expect(producerLog.events).toHaveLength(1);
		const relayLog = logs();
		const upstream = new Response(stream(chunks), {
			headers: {
				'content-type': 'application/x-ndjson',
				'content-length': '1',
				'content-encoding': 'gzip'
			}
		});
		const relayed = copyGatewayResponse(upstream, context({ logger: relayLog.logger }));
		expect(relayed.headers?.['content-encoding']).toBeUndefined();
		const downstreamLog = logs();
		const parsed = await readExactStreamResponse(
			{ body: relayed.stream },
			[{ type: 'invoke', id: 'save' }],
			{ logger: downstreamLog.logger }
		);
		expect(parsed[0]).toMatchObject({ ok: true, value });
		expect(relayLog.events).toHaveLength(1);
		expect(downstreamLog.events).toHaveLength(1);
		expect(upstream.body?.locked).toBe(false);
	});
	it('crosses the actual 100000-event default without dropping events and warns once', async () => {
		const log = logs();
		let count = 0;
		const body = new ReadableStream<Uint8Array>({
			pull(c) {
				if (count === 100002) {
					c.close();
					return;
				}
				count++;
				c.enqueue(wire({ n: count }));
			}
		});
		let received = 0;
		await readNdjsonEvents(body, 'invalid', () => received++, { logger: log.logger });
		expect(received).toBe(100002);
		expect(log.events).toHaveLength(1);
		expect(log.events[0]?.data).toMatchObject({
			option: 'maxEvents',
			threshold: 100000,
			actual: 100001,
			explicit: false
		});
		expect(body.locked).toBe(false);
	});
	it('hard-fails explicit producer bytes with clear logs and exactly-once cancellation/disposal', async () => {
		const log = logs();
		let cancelled = 0,
			disposed = 0;
		const output = createProgressStream(
			async (writer) => {
				await writer.emit(complete);
			},
			{
				signal: new AbortController().signal,
				maxBytes: 1,
				logger: log.logger,
				cancel() {
					cancelled++;
				},
				dispose() {
					disposed++;
				}
			}
		);
		await expect(collect(output)).rejects.toThrow(/maxStreamBytes.*actual.*configured cap 1/);
		expect(cancelled).toBe(1);
		expect(disposed).toBe(1);
		expect(log.events[0]).toMatchObject({
			level: 'error',
			data: { option: 'maxStreamBytes', threshold: 1, explicit: true }
		});
	});
	it('counts exact UTF8, cancels and releases explicit client and gateway readers', async () => {
		const bytes = wire('é');
		expect(bytes.byteLength).toBe(5);
		const log = logs();
		let reads = 0,
			cancelled = 0;
		const body = new ReadableStream<Uint8Array>({
			pull(c) {
				reads++;
				c.enqueue(bytes);
			},
			cancel() {
				cancelled++;
			}
		});
		await expect(
			readNdjsonEvents(body, 'invalid', () => {}, { maxBytes: 4, logger: log.logger })
		).rejects.toThrow(/maxBytes/);
		expect(cancelled).toBe(1);
		expect(body.locked).toBe(false);
		expect(reads).toBeLessThanOrEqual(2);
		let upstreamCancelled = 0;
		const upstream = new ReadableStream<Uint8Array>({
			pull(c) {
				c.enqueue(bytes);
			},
			cancel() {
				upstreamCancelled++;
			}
		});
		const relayLog = logs();
		const relay = copyGatewayResponse(
			new Response(upstream),
			context({ logger: relayLog.logger, limits: { maxResponseBytes: 4 } })
		);
		await expect(collect(relay.stream!)).rejects.toThrow(/maxResponseBytes/);
		expect(upstreamCancelled).toBe(1);
		expect(upstream.locked).toBe(false);
		expect(relayLog.events[0]?.level).toBe('error');
	});
	it('accepts depth beyond100 with warnings while standalone codec and input validation retain default depth', () => {
		const value = nested(110);
		expect(() => encodeReactiveProtocolValue(value)).toThrow(/deep/);
		const encoded = encodeReactiveProtocolValue(value, { maxDepth: 200 });
		expect(() => decodeReactiveProtocolValue(encoded)).toThrow(/deep/);
		expect(decodeReactiveProtocolValue(encoded, { maxDepth: 200 })).toEqual(value);
		expect(serverJsonSafe(value)).toBe(false);
		const log = logs();
		const response = limitedJsonResponse(context({ logger: log.logger }), 200, { value });
		expect(JSON.parse(response.body).value).toEqual(value);
		expect(
			log.events.filter((x) => (x.data as { option?: string })?.option === 'maxJsonDepth')
		).toHaveLength(1);
		expect(() =>
			limitedJsonResponse(context({ logger: logs().logger, limits: { maxJsonDepth: 5 } }), 200, {
				value
			})
		).toThrow(/maxJsonDepth.*configured cap 5/);
	});
	it('keeps graph validity, explicit node/patch caps, and large valid progress snapshots separate', () => {
		const cycle: Record<string, unknown> = {};
		cycle.self = cycle;
		expect(isInvocationResultSafe({ value: cycle })).toBe(false);
		const accessor = Object.defineProperty({}, 'value', {
			enumerable: true,
			get() {
				throw Error('must not execute');
			}
		});
		expect(isInvocationResultSafe({ value: accessor })).toBe(false);
		expect(isInvocationResultSafe({ value: new Date() })).toBe(false);
		expect(() => isInvocationResultSafe({ value: [1, 2, 3] }, { maxJsonNodes: 2 })).toThrow(
			/maxJsonNodes/
		);
		expect(() =>
			isInvocationResultSafe(
				{
					patches: [
						{ type: 'text', id: 'x', value: 'a' },
						{ type: 'text', id: 'x', value: 'b' }
					]
				},
				{ maxPatches: 1 }
			)
		).toThrow(/maxPatches/);
		const log = logs();
		const snapshot = { value: 'a'.repeat(65537) };
		expect(captureProgressSnapshot(snapshot, context({ logger: log.logger }))).toEqual(snapshot);
		expect(log.events).toHaveLength(1);
		expect(() =>
			captureProgressSnapshot(
				snapshot,
				context({ logger: logs().logger, limits: { maxResponseBytes: 65536 } })
			)
		).toThrow(/maxResponseBytes/);
	});
	it('retains caller cancellation identity and closes progress observers', async () => {
		const abort = new AbortController();
		const reason = new Error('owner stopped');
		let cancelled = 0,
			closed = 0;
		const body = new ReadableStream<Uint8Array>({
			pull(c) {
				c.enqueue(wire({ event: 'start', version: 1, operations: 1 }));
				abort.abort(reason);
			},
			cancel() {
				cancelled++;
			}
		});
		await expect(
			readExactStreamResponse({ body }, [{ type: 'invoke', id: 'save' }], {
				signal: abort.signal,
				progress: [
					{
						receivers: ['r'],
						report() {},
						close() {
							closed++;
						}
					}
				]
			})
		).rejects.toBe(reason);
		expect(cancelled).toBe(1);
		expect(closed).toBe(1);
		expect(body.locked).toBe(false);
	});
	it('warns for actual default node and patch excess while retaining assembled data', async () => {
		const nodeLog = logs();
		const values = Array.from({ length: 100001 }, () => 1);
		const result = await invokeExact({
			endpoint: '/exact',
			type: 'invoke',
			id: 'save',
			logger: nodeLog.logger,
			fetch: async () => ({
				ok: true,
				status: 200,
				json: async () => ({ ok: true, type: 'invoke', id: 'save', value: values })
			})
		});
		expect(result.value).toEqual(values);
		expect(
			nodeLog.events.filter(
				(event) => (event.data as { option?: string })?.option === 'maxJsonNodes'
			)
		).toHaveLength(1);
		const patch = { type: 'text', id: 'x', value: 'a' };
		const terminal = Array.from({ length: 10000 }, () => ({ ...patch }));
		const frames = [
			{ event: 'start', version: 1, operations: 1 },
			{ event: 'patch', version: 1, index: 0, type: 'invoke', id: 'save', patch },
			{
				event: 'result',
				version: 1,
				index: 0,
				result: { ok: true, type: 'invoke', id: 'save', patches: terminal }
			},
			complete
		];
		const log = logs();
		const combined = await readExactStreamResponse(
			{ body: stream(frames.map(wire)) },
			[{ type: 'invoke', id: 'save' }],
			{ logger: log.logger }
		);
		expect(combined[0]).toHaveProperty('patches.length', 10001);
		expect(
			log.events.filter((event) => (event.data as { option?: string })?.option === 'maxPatches')
		).toHaveLength(1);
		let index = 0,
			cancelled = 0;
		const limited = new ReadableStream<Uint8Array>(
			{
				pull(c) {
					c.enqueue(wire(frames[index++]));
				},
				cancel() {
					cancelled++;
				}
			},
			{ highWaterMark: 0 }
		);
		await expect(
			readExactStreamResponse({ body: limited }, [{ type: 'invoke', id: 'save' }], {
				logger: logs().logger,
				maxPatches: 10000
			})
		).rejects.toThrow(/maxPatches/);
		expect(cancelled).toBe(1);
		expect(limited.locked).toBe(false);
	});
	it('applies configured graph caps per operation in both transports with structured server errors', async () => {
		for (const streaming of [false, true]) {
			const log = logs();
			const response = await handleExactRequest(
				{
					method: 'POST',
					headers: streaming ? { accept: 'application/x-ndjson' } : {},
					body: { type: 'invoke', id: 'allowed-action' }
				},
				executionContext({
					logger: log.logger,
					limits: { maxResponseBytes: 64 },
					invocations: { 'allowed-action': () => ({ value: 'é'.repeat(100) }) }
				})
			);
			if (streaming) {
				const frames = (await collect(response.stream!)).flatMap((bytes) =>
					new TextDecoder()
						.decode(bytes)
						.trim()
						.split('\n')
						.map((line) => JSON.parse(line))
				);
				expect(frames).toContainEqual(
					expect.objectContaining({
						event: 'result',
						result: expect.objectContaining({ ok: false, status: 500 })
					})
				);
			} else expect(response.status).toBe(500);
			expect(
				log.events.some(
					(event) =>
						event.level === 'error' &&
						(event.data as { option?: string })?.option === 'maxResponseBytes'
				)
			).toBe(true);
		}
	});
});
