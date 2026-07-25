import { createContext } from '@exactjs/core';
import { RequestContext } from '@exactjs/request';
import { describe, expect, it, vi } from 'vitest';
import {
	createExactContextRuntime,
	defineExactActionContract,
	handleExactRequest,
	openExactRequestScope,
	runWithExactRequestScope,
	type ExactRequestLike,
	type ExactResponseLike,
	type ExactServerContext
} from './index.js';

const ApplicationValue = createContext<{ prefix: string }>('test.application', {
	global: true,
	reactive: false,
	scope: 'application'
});
const RequestValue = createContext<string>('test.request', {
	global: true,
	reactive: false,
	scope: 'request'
});

const request = (
	path: string,
	signal?: AbortSignal,
	platformRequest: unknown = { path }
): ExactRequestLike => ({
	method: 'POST',
	url: `https://example.test/${path}`,
	headers: {
		'content-type': 'application/json',
		'x-request-id': `trace-${path}`
	},
	body: { type: 'action', id: 'read' },
	signal,
	platformRequest
});

const server = (overrides: Partial<ExactServerContext> = {}): ExactServerContext => ({
	contract: {
		version: 1,
		actions: { read: defineExactActionContract('read') },
		boundaries: {}
	},
	...overrides
});

describe('server context scopes', () => {
	it('normalizes one trusted scope for security hooks and action handlers', async () => {
		const platform = { host: 'fetch' };
		const observed: unknown[] = [];
		let securityScope: unknown;
		let actionScope: unknown;
		const context = server({
			applicationContexts: [
				[
					ApplicationValue,
					{
						create: () => ({ prefix: 'application' })
					}
				]
			],
			requestContexts: [
				[
					RequestValue,
					{
						async create(scope) {
							const app = await scope.get(ApplicationValue);
							return `${app.prefix}:${scope.request!.url.pathname}`;
						}
					}
				]
			],
			authorize(_request, _input, scoped) {
				securityScope = scoped.contexts;
				return true;
			},
			actions: {
				async read(_input, scoped) {
					actionScope = scoped.contexts;
					observed.push(
						scoped.requestContext,
						scoped.contexts?.getSync(ApplicationValue),
						scoped.contexts?.getSync(RequestValue),
						scoped.platformRequest
					);
					scoped.requestContext!.setStatus(202);
					scoped.requestContext!.setHeader('x-scope', 'active');
					return { state: { ok: true } };
				}
			}
		});

		const response = await handleExactRequest(request('orders', undefined, platform), context);

		expect(response.status).toBe(202);
		expect(response.headers['x-scope']).toBe('active');
		expect(observed[0]).toMatchObject({
			method: 'POST',
			traceId: 'trace-orders',
			url: new URL('https://example.test/orders')
		});
		expect(observed[1]).toEqual({ prefix: 'application' });
		expect(observed[2]).toBe('application:/orders');
		expect(observed[3]).toBe(platform);
		expect(securityScope).toBe(actionScope);
	});

	it('rejects invalid lifetimes, duplicate registrations, and dependency cycles', async () => {
		const RequestA = createContext<string>('test.request.a', { scope: 'request' });
		const RequestB = createContext<string>('test.request.b', { scope: 'request' });
		const invalidLifetime = createExactContextRuntime({
			applicationContexts: [[RequestA, { value: 'invalid' }]]
		});
		await expect(invalidLifetime.open(request('invalid'))).rejects.toThrow(
			'cannot be registered as application-scoped'
		);

		const duplicate = createExactContextRuntime({
			requestContexts: [
				[RequestA, { value: 'a' }],
				[RequestA, { value: 'b' }]
			]
		});
		await expect(duplicate.open(request('duplicate'))).rejects.toThrow('registered more than once');

		const cycle = createExactContextRuntime({
			requestContexts: [
				[RequestA, { create: async (scope) => `a:${await scope.get(RequestB)}` }],
				[RequestB, { create: async (scope) => `b:${await scope.get(RequestA)}` }]
			]
		});
		await expect(cycle.open(request('cycle'))).rejects.toThrow(
			'test.request.a -> test.request.b -> test.request.a'
		);

		const applicationDependency = createExactContextRuntime({
			applicationContexts: [
				[
					ApplicationValue,
					{
						async create(scope) {
							await scope.get(RequestA);
							return { prefix: 'invalid' };
						}
					}
				]
			]
		});
		await expect(applicationDependency.open(request('lifetime'))).rejects.toThrow(
			'Context "test.request.a" is not registered'
		);
	});

	it('supports concurrent independent dependency reads without false cycles', async () => {
		const Left = createContext<string>('test.request.left', { scope: 'request' });
		const Right = createContext<string>('test.request.right', { scope: 'request' });
		const Combined = createContext<string>('test.request.combined', { scope: 'request' });
		const runtime = createExactContextRuntime({
			requestContexts: [
				[
					Combined,
					{
						async create(scope) {
							const [left, right] = await Promise.all([scope.get(Left), scope.get(Right)]);
							return `${left}:${right}`;
						}
					}
				],
				[Left, { create: async () => 'left' }],
				[Right, { create: async () => 'right' }]
			]
		});
		const opened = await runtime.open(request('parallel'));
		expect(opened.context.getSync(Combined)).toBe('left:right');
		await opened.dispose();
		await runtime.dispose();
	});

	it('initializes dependencies deterministically and disposes owned values in reverse order', async () => {
		const AppA = createContext<{ name: string }>('test.app.a', { scope: 'application' });
		const AppB = createContext<{ name: string }>('test.app.b', { scope: 'application' });
		const events: string[] = [];
		const runtime = createExactContextRuntime({
			applicationContexts: [
				[
					AppB,
					{
						async create(scope) {
							const a = await scope.get(AppA);
							events.push(`create-b:${a.name}`);
							return { name: 'b' };
						},
						dispose: () => {
							events.push('dispose-b');
						}
					}
				],
				[
					AppA,
					{
						create() {
							events.push('create-a');
							return { name: 'a' };
						},
						dispose: () => {
							events.push('dispose-a');
						}
					}
				]
			],
			requestContexts: [
				[
					RequestValue,
					{
						create() {
							events.push('create-request');
							return 'request';
						},
						dispose: () => {
							events.push('dispose-request');
						}
					}
				]
			]
		});

		const opened = await runtime.open(request('lifecycle'));
		await opened.dispose('complete');
		await runtime.dispose('shutdown');

		expect(events).toEqual([
			'create-a',
			'create-b:a',
			'create-request',
			'dispose-request',
			'dispose-b',
			'dispose-a'
		]);
	});

	it('supports trusted test overrides without constructing replaced providers', async () => {
		const createApplication = vi.fn(() => ({ prefix: 'real' }));
		const createRequest = vi.fn(() => 'real');
		const runtime = createExactContextRuntime({
			applicationContexts: [[ApplicationValue, { create: createApplication }]],
			requestContexts: [[RequestValue, { create: createRequest }]],
			contextOverrides: {
				application: [[ApplicationValue, { prefix: 'test' }]],
				request: [[RequestValue, 'test-request']]
			}
		});

		const opened = await runtime.open(request('override'));
		expect(opened.context.getSync(ApplicationValue)).toEqual({ prefix: 'test' });
		expect(opened.context.getSync(RequestValue)).toBe('test-request');
		expect(createApplication).not.toHaveBeenCalled();
		expect(createRequest).not.toHaveBeenCalled();
		await opened.dispose();
		await runtime.dispose();
	});

	it('reuses application providers in a warm runtime and isolates runtime instances', async () => {
		let nextId = 0;
		const createRuntime = () =>
			createExactContextRuntime({
				applicationContexts: [
					[
						ApplicationValue,
						{
							create: () => ({ prefix: `runtime-${++nextId}` })
						}
					]
				],
				requestContexts: [
					[
						RequestValue,
						{
							async create(scope) {
								return (await scope.get(ApplicationValue)).prefix;
							}
						}
					]
				]
			});
		const first = createRuntime();
		const second = createRuntime();

		const firstA = await first.open(request('first-a'));
		const firstB = await first.open(request('first-b'));
		const secondA = await second.open(request('second-a'));
		expect(firstA.context.getSync(RequestValue)).toBe('runtime-1');
		expect(firstB.context.getSync(RequestValue)).toBe('runtime-1');
		expect(secondA.context.getSync(RequestValue)).toBe('runtime-2');

		await Promise.all([firstA.dispose(), firstB.dispose(), secondA.dispose()]);
		await Promise.all([first.dispose(), second.dispose()]);
	});

	it('aborts and disposes active requests when the server runtime closes', async () => {
		const disposeRequest = vi.fn();
		const runtime = createExactContextRuntime({
			requestContexts: [
				[
					RequestValue,
					{
						create: () => 'active',
						dispose: disposeRequest
					}
				]
			]
		});
		const opened = await runtime.open(request('active'));
		expect(opened.request.signal.aborted).toBe(false);

		await runtime.dispose('shutdown');

		expect(opened.request.signal.aborted).toBe(true);
		expect(opened.request.signal.reason).toBe('shutdown');
		expect(disposeRequest).toHaveBeenCalledWith('active', 'shutdown');
		await opened.dispose();
		expect(disposeRequest).toHaveBeenCalledOnce();
	});

	it('isolates concurrent requests and makes RequestContext available to factories', async () => {
		const runtime = createExactContextRuntime({
			requestContexts: [
				[
					RequestValue,
					{
						async create(scope) {
							const current = await scope.get(RequestContext);
							await Promise.resolve();
							return current.url.pathname;
						}
					}
				]
			]
		});

		const values = await Promise.all(
			['a', 'b', 'c'].map(async (path) => {
				const opened = await runtime.open(request(path));
				try {
					return [
						opened.context.getSync(RequestValue),
						opened.context.getSync(RequestContext).url.pathname
					];
				} finally {
					await opened.dispose();
				}
			})
		);

		expect(values).toEqual([
			['/a', '/a'],
			['/b', '/b'],
			['/c', '/c']
		]);
		await runtime.dispose();
	});

	it('cancels request factories and disposes resources initialized before failure', async () => {
		const First = createContext<object>('test.request.first', { scope: 'request' });
		const Blocked = createContext<object>('test.request.blocked', { scope: 'request' });
		const disposeFirst = vi.fn();
		const abort = new AbortController();
		const runtime = createExactContextRuntime({
			requestContexts: [
				[
					First,
					{
						create: () => ({}),
						dispose: disposeFirst
					}
				],
				[
					Blocked,
					{
						create: (scope) =>
							new Promise((_resolve, reject) => {
								scope.signal.addEventListener('abort', () => reject(scope.signal.reason), {
									once: true
								});
							})
					}
				]
			]
		});

		const opening = runtime.open(request('abort', abort.signal));
		await Promise.resolve();
		abort.abort(new DOMException('gone', 'AbortError'));

		await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
		expect(disposeFirst).toHaveBeenCalledOnce();
		await runtime.dispose();
	});

	it('disposes resources that finish initializing after cancellation', async () => {
		const Late = createContext<object>('test.request.late', { scope: 'request' });
		let release!: (value: object) => void;
		const created = new Promise<object>((resolve) => {
			release = resolve;
		});
		const disposeLate = vi.fn();
		const abort = new AbortController();
		const runtime = createExactContextRuntime({
			requestContexts: [
				[
					Late,
					{
						create: () => created,
						dispose: disposeLate
					}
				]
			]
		});

		const opening = runtime.open(request('late', abort.signal));
		await Promise.resolve();
		abort.abort(new DOMException('gone', 'AbortError'));
		await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
		const value = {};
		release(value);
		await Promise.resolve();
		await Promise.resolve();
		expect(disposeLate).toHaveBeenCalledWith(value, abort.signal.reason);
		await runtime.dispose();
	});

	it('retains request resources until a response stream closes', async () => {
		const disposeRequest = vi.fn();
		const context = server({
			requestContexts: [
				[
					RequestValue,
					{
						create: () => 'stream',
						dispose: disposeRequest
					}
				]
			]
		});
		const response = await runWithExactRequestScope(
			request('stream'),
			context,
			(scoped) =>
				({
					status: 200,
					headers: {},
					body: '',
					stream: new ReadableStream<Uint8Array>({
						start(controller) {
							expect(scoped.contexts?.getSync(RequestValue)).toBe('stream');
							controller.enqueue(new TextEncoder().encode('ok'));
							controller.close();
						}
					})
				}) satisfies ExactResponseLike
		);

		expect(disposeRequest).not.toHaveBeenCalled();
		const reader = response.stream!.getReader();
		expect(new TextDecoder().decode((await reader.read()).value)).toBe('ok');
		expect((await reader.read()).done).toBe(true);
		expect(disposeRequest).toHaveBeenCalledOnce();
	});

	it('disposes an unread streaming scope when the host request aborts', async () => {
		const disposeRequest = vi.fn();
		const abort = new AbortController();
		const context = server({
			requestContexts: [
				[
					RequestValue,
					{
						create: () => 'unread',
						dispose: disposeRequest
					}
				]
			]
		});
		const response = await runWithExactRequestScope(
			request('unread', abort.signal),
			context,
			() => ({
				status: 200,
				headers: {},
				body: '',
				stream: new ReadableStream<Uint8Array>()
			})
		);

		expect(response.stream).toBeDefined();
		abort.abort(new DOMException('disconnected', 'AbortError'));
		await Promise.resolve();
		await Promise.resolve();
		expect(disposeRequest).toHaveBeenCalledOnce();
	});

	it('allows initial SSR-style work to open the same explicit trusted scope', async () => {
		const context = server({
			requestContexts: [
				[
					RequestValue,
					{
						create: (scope) => scope.request!.url.pathname
					}
				]
			]
		});
		const opened = await openExactRequestScope(request('ssr'), context);
		try {
			expect(opened.context.requestContext?.url.pathname).toBe('/ssr');
			expect(opened.context.contexts?.getSync(RequestValue)).toBe('/ssr');
		} finally {
			await opened.dispose();
		}
	});
});
