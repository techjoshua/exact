import type { ExactBuildInspectionCatalog } from '@exactjs/devtools-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exactServerDebugRuntime, handleExactRequest } from './index.js';
import type { ExactRequestLike, ExactServerContext } from './types.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';
const sourceHash = 'a'.repeat(64);
const catalog: ExactBuildInspectionCatalog = Object.freeze({
	protocol: 1,
	buildKey,
	producer: Object.freeze({ packageName: 'app' }),
	roots: Object.freeze({
		page: Object.freeze({
			executionRoot: 'page',
			rootComponentId: 'component:Page',
			files: Object.freeze([
				Object.freeze({
					path: 'src/Page.tsx',
					sourceHash,
					components: Object.freeze([
						Object.freeze({
							id: 'component:Page',
							kind: 'component',
							name: 'Page',
							location: location(),
							classification: Object.freeze({ kind: 'initializer' }),
							reasons: Object.freeze([]),
							children: Object.freeze([
								Object.freeze({
									id: 'component:Page:task:load',
									kind: 'inferred-task',
									location: location(),
									classification: Object.freeze({
										kind: 'task',
										placement: 'server',
										dependencies: Object.freeze([{ path: 'state.id' }])
									}),
									reasons: Object.freeze([]),
									children: Object.freeze([])
								})
							])
						})
					])
				})
			]),
			partitionPlans: Object.freeze([
				Object.freeze({
					version: 1,
					buildKey,
					roots: ['component'],
					nodes: [{ id: 'component' }],
					edges: []
				})
			]),
			redactions: Object.freeze({
				statePaths: Object.freeze([]),
				contextTokens: Object.freeze([]),
				secretNames: Object.freeze(['API_SECRET'])
			})
		})
	})
});

afterEach(() => {
	vi.useRealTimers();
});

describe('server-cooperative debug protocol', () => {
	it('does not construct or decode debug ownership for ordinary requests', async () => {
		const response = await handleExactRequest(
			{ method: 'GET', url: '/__exact' },
			server({ inspectionCatalogs: [{} as ExactBuildInspectionCatalog] })
		);

		expect(response.status).toBe(405);
	});

	it('defaults off in production and conceals catalog existence', async () => {
		const previous = process.env.NODE_ENV;
		process.env.NODE_ENV = 'production';
		try {
			const response = await handleExactRequest(debugOpen(), server());
			expect(response.status).toBe(404);
			expect(response.headers['cache-control']).toBe('no-store');
		} finally {
			if (previous === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = previous;
		}
	});

	it('honors asynchronous authorization and exact build/root catalog lookup', async () => {
		const allowDebug = vi.fn(async () => true);
		const context = server({ allowDebug });
		const opened = await handleExactRequest(debugOpen(), context);
		const sessionId = responseJson(opened).session.id as string;
		const queried = await handleExactRequest(
			debugQuery(sessionId, 'dependencies.explain', {
				identity: runtimeIdentity(sessionId),
				sourceEntityId: 'component:Page:task:load'
			}),
			context
		);

		expect(queried.status).toBe(200);
		expect(responseJson(queried).result).toMatchObject({
			kind: 'inferred-task',
			classification: { placement: 'server' }
		});
		expect(allowDebug).toHaveBeenCalled();

		const wrongBuild = await handleExactRequest(
			debugQuery(sessionId, 'catalog.entity', {
				identity: { ...runtimeIdentity(sessionId), buildKey: 'f'.repeat(40) },
				sourceEntityId: 'component:Page'
			}),
			context
		);
		expect(wrongBuild.status).toBe(404);
		expect(JSON.stringify(responseJson(wrongBuild))).not.toContain('Page.tsx');
	});

	it('returns value-free activation plans through catalog authorization', async () => {
		const context = server();
		const opened = await handleExactRequest(debugOpen(), context);
		const sessionId = responseJson(opened).session.id as string;
		const response = await handleExactRequest(
			debugQuery(sessionId, 'partitions.plan', { identity: runtimeIdentity(sessionId) }),
			context
		);

		expect(responseJson(response).result).toEqual([
			expect.objectContaining({ buildKey, roots: ['component'] })
		]);
	});

	it('requires source capability and a matching hash while redacting known secret literals', async () => {
		const context = server({
			allowDebug: ({ capability }) => (capability !== 'source' ? true : true),
			inspectionSources: {
				[`${buildKey}\0page\0src/Page.tsx`]: {
					buildKey,
					executionRoot: 'page',
					sourceHash,
					content: `const API_SECRET = "[redacted]";\nexport function Page() {}`,
					redacted: true
				}
			}
		});
		const opened = await handleExactRequest(debugOpen(['snapshot']), context);
		const sessionId = responseJson(opened).session.id as string;
		const source = await handleExactRequest(
			debugQuery(sessionId, 'source.excerpt', {
				identity: runtimeIdentity(sessionId),
				path: 'src/Page.tsx',
				sourceHash
			}),
			context
		);
		expect(source.status).toBe(200);
		expect(JSON.stringify(responseJson(source))).not.toContain('do-not-expose');

		const mismatch = await handleExactRequest(
			debugQuery(sessionId, 'source.excerpt', {
				identity: runtimeIdentity(sessionId),
				path: 'src/Page.tsx',
				sourceHash: 'b'.repeat(64)
			}),
			context
		);
		expect(mismatch.status).toBe(404);
	});

	it('refuses retained source that was not pre-redacted when a catalog contains secrets', async () => {
		const context = server({
			allowDebug: true,
			inspectionSources: {
				[`${buildKey}\0page\0src/Page.tsx`]: {
					buildKey,
					executionRoot: 'page',
					sourceHash,
					content: `sendSomewhere("do-not-expose")`
				}
			}
		});
		const opened = await handleExactRequest(debugOpen(['source']), context);
		const sessionId = responseJson(opened).session.id as string;
		const source = await handleExactRequest(
			debugQuery(sessionId, 'source.excerpt', {
				identity: runtimeIdentity(sessionId),
				path: 'src/Page.tsx',
				sourceHash
			}),
			context
		);
		expect(source.status).toBe(404);
		expect(source.body).not.toContain('do-not-expose');
	});

	it('does not reflect query failures or state values into responses or audit records', async () => {
		const secret = 'must-never-enter-debug-output';
		const audits: unknown[] = [];
		const context = server({
			allowDebug: true,
			inspectionQueryService: {
				async request() {
					throw new Error(secret);
				},
				subscribe() {
					return { closed: true, close() {} };
				}
			},
			onDebugAudit: (event) => audits.push(event)
		});
		const opened = await handleExactRequest(debugOpen(['snapshot']), context);
		const sessionId = responseJson(opened).session.id as string;
		const queried = await handleExactRequest(debugQuery(sessionId, 'components.tree'), context);

		expect(queried.status).toBe(404);
		expect(JSON.stringify({ response: responseJson(queried), audits })).not.toContain(secret);
		expect(audits).toEqual([
			expect.objectContaining({ method: 'components.tree', resultBytes: expect.any(Number) })
		]);
	});

	it('keeps debug IDs out of invocation dispatch and records bounded observations', async () => {
		let invoked = 0;
		const context = server({
			allowDebug: true,
			invocations: {
				'component:Page:task:load': () => {
					invoked++;
					return {};
				}
			}
		});
		const opened = await handleExactRequest(debugOpen(), context);
		const sessionId = responseJson(opened).session.id as string;
		exactServerDebugRuntime(context).observe({
			kind: 'continuation.execute',
			buildKey,
			executionRoot: 'page',
			componentTypeId: 'component:Page',
			operationId: 'operation-1'
		});
		const timeline = await handleExactRequest(
			debugQuery(sessionId, 'timeline.query', { page: { limit: 10 } }),
			context
		);

		expect(invoked).toBe(0);
		expect(responseJson(timeline).result).toEqual([
			expect.objectContaining({ kind: 'continuation.execute' })
		]);
	});

	it('rejects cross-origin debug requests before authorization', async () => {
		const allowDebug = vi.fn(() => true);
		const response = await handleExactRequest(
			{
				...debugOpen(),
				url: 'https://app.test/__exact',
				headers: { origin: 'https://evil.test' }
			},
			server({ publicOrigin: 'https://app.test', allowDebug })
		);
		expect(response.status).toBe(404);
		expect(allowDebug).not.toHaveBeenCalled();
	});

	it('binds a session to the application-selected authenticated identity', async () => {
		const context = server({
			allowDebug: true,
			debugSessionIdentity: ({ request }) =>
				request.headers instanceof Headers
					? (request.headers.get('x-user') ?? undefined)
					: (request.headers?.['x-user'] as string | undefined)
		});
		const opened = await handleExactRequest(
			{ ...debugOpen(), headers: { 'x-user': 'operator-a' } },
			context
		);
		const sessionId = responseJson(opened).session.id as string;
		const transferred = await handleExactRequest(
			{
				...debugQuery(sessionId, 'timeline.query', { page: { limit: 1 } }),
				headers: { 'x-user': 'operator-b' }
			},
			context
		);
		expect(transferred.status).toBe(404);
		const originalAfterTransfer = await handleExactRequest(
			{
				...debugQuery(sessionId, 'timeline.query', { page: { limit: 1 } }),
				headers: { 'x-user': 'operator-a' }
			},
			context
		);
		expect(originalAfterTransfer.status).toBe(404);
	});

	it('reauthorizes idle event streams and closes them after resolver revocation', async () => {
		vi.useFakeTimers();
		let authorized = true;
		const context = server({ allowDebug: async () => authorized });
		const opened = await handleExactRequest(debugOpen(['events']), context);
		const sessionId = responseJson(opened).session.id as string;
		const subscribed = await handleExactRequest(
			{
				method: 'POST',
				url: '/__exact',
				headers: { accept: 'application/x-ndjson' },
				body: {
					type: 'debug',
					version: 1,
					request: 'subscribe',
					sessionId
				}
			},
			context
		);
		const reader = subscribed.stream!.getReader();
		await Promise.resolve();
		authorized = false;
		await vi.advanceTimersByTimeAsync(1_000);

		await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
	});
});

function server(overrides: Partial<ExactServerContext> = {}): ExactServerContext {
	return {
		contract: {
			version: 1,
			endpoint: '/__exact',
			invocations: {},
			executors: {},
			boundaries: {}
		},
		inspectionCatalogs: [catalog],
		...overrides
	};
}

function debugOpen(capabilities = ['catalog', 'snapshot', 'events', 'source']): ExactRequestLike {
	return {
		method: 'POST',
		url: '/__exact',
		body: {
			type: 'debug',
			version: 1,
			request: 'open',
			capabilities
		}
	};
}

function debugQuery(
	sessionId: string,
	method: string,
	params: Record<string, unknown> = {}
): ExactRequestLike {
	return {
		method: 'POST',
		url: '/__exact',
		body: {
			type: 'debug',
			version: 1,
			request: 'query',
			sessionId,
			query: { protocol: 1, id: `query-${method}`, method, params }
		}
	};
}

function runtimeIdentity(sessionId: string) {
	return {
		sessionId,
		side: 'server',
		buildKey,
		executionRoot: 'page',
		componentTypeId: 'component:Page'
	} as const;
}

function responseJson(response: { body: string }): any {
	return JSON.parse(response.body);
}

function location() {
	return Object.freeze({
		path: 'src/Page.tsx',
		sourceHash,
		start: Object.freeze({ offset: 0, line: 1, column: 1 }),
		end: Object.freeze({ offset: 10, line: 1, column: 11 })
	});
}
