import { createContext } from './index.js';
import { createExpression } from './runtime/render.js';
import { describe, expect, it } from 'vitest';
import {
	activateServerComponentTaskForHost,
	awaitServerComponentTask,
	createServerComponentExecutionFrame,
	issueServerComponentReceipt,
	readServerComponentOutputForHost,
	registerServerComponentContinuationContextsForHost,
	serverComponentDependencyForValue,
	serverComponentContinuationContextValuesForHost,
	serverComponentExecutionValueForHost,
	serverComponentTaskTimeout,
	settledServerComponentContinuationIdsForHost,
	withServerComponentIssuer,
	type ServerComponentTaskSlice
} from './framework/server-component-execution.js';

const valueSlice = [
	[],
	[[0, ['value']]],
	'blocking',
	'produce'
] as const satisfies ServerComponentTaskSlice;
const consumeSlice = [[-1], [], 'blocking', 'consume'] as const satisfies ServerComponentTaskSlice;

describe('compiler-closed server component execution', () => {
	it('keeps deferred output reads synchronous when ready and rejects disposed ownership', async () => {
		const host = { state: {} };
		const frame = createServerComponentExecutionFrame(host, { prepareOutput: (read) => read() });
		try {
			expect(readServerComponentOutputForHost(host, () => 42)).toBe(42);
		} finally {
			await frame[Symbol.asyncDispose]();
		}
		let read = false;
		expect(() =>
			readServerComponentOutputForHost(host, () => {
				read = true;
			})
		).toThrow(/live task owner/);
		expect(read).toBe(false);
	});
	it('selects task readiness by compiler identity while preserving request disposal', async () => {
		const host = { state: {} };
		const frame = createServerComponentExecutionFrame(host, { trackTaskIdentities: true });
		let releaseBody!: () => void;
		const body = new Promise<void>((resolve) => {
			releaseBody = resolve;
		});
		const selection = new Set(['head']);
		const version = frame.blockingVersionFor(selection);
		try {
			activateServerComponentTaskForHost(
				host,
				[[], [], 'blocking', 'head'],
				'head',
				() => undefined
			);
			activateServerComponentTaskForHost(host, [[], [], 'blocking', 'body'], 'body', () => body);
			await frame.blockingWork(selection);
			expect(frame.blockingWork(selection)).toBeUndefined();
			expect(frame.blockingVersionFor(selection)).toBe(version + 1);
			expect(frame.blockingWork()).toBeInstanceOf(Promise);
		} finally {
			releaseBody();
			await frame[Symbol.asyncDispose]();
		}
	});

	it('publishes an empty context selection without requiring an execution frame', () => {
		expect(serverComponentContinuationContextValuesForHost({}, [])).toEqual({});
	});

	it('recognizes dependency tokens created by another evaluated runtime copy', () => {
		const token = {
			[Symbol.for('@exactjs/server-component-dependency')]: {
				status: 'available',
				value: 'ready'
			}
		};
		expect(serverComponentDependencyForValue(token)?.read()).toMatchObject({
			status: 'available',
			value: 'ready'
		});
	});

	it('isolates forwarded task outputs across concurrent request frames', async () => {
		const left = { state: { value: 'pending' } };
		const right = { state: { value: 'pending' } };
		const leftSettlements: Promise<unknown>[] = [];
		const rightSettlements: Promise<unknown>[] = [];
		const leftFrame = createServerComponentExecutionFrame(left, {
			observe: (settlement) => leftSettlements.push(settlement)
		});
		const rightFrame = createServerComponentExecutionFrame(right, {
			observe: (settlement) => rightSettlements.push(settlement)
		});
		const consumed: string[] = [];
		try {
			activateServerComponentTaskForHost(left, valueSlice, 'left', async () => {
				await Promise.resolve();
				left.state.value = 'left';
			});
			activateServerComponentTaskForHost(right, valueSlice, 'right', async () => {
				await Promise.resolve();
				right.state.value = 'right';
			});
			activateServerComponentTaskForHost(
				left,
				consumeSlice,
				'consume-left',
				(value: string, _task) => void consumed.push(value),
				serverComponentExecutionValueForHost(left, 'value', 'stale') as string
			);
			activateServerComponentTaskForHost(
				right,
				consumeSlice,
				'consume-right',
				(value: string, _task) => void consumed.push(value),
				serverComponentExecutionValueForHost(right, 'value', 'stale') as string
			);
			await Promise.all([...leftSettlements, ...rightSettlements]);
			expect(consumed.sort()).toEqual(['left', 'right']);
		} finally {
			await Promise.all([
				Promise.resolve(leftFrame[Symbol.asyncDispose]()),
				Promise.resolve(rightFrame[Symbol.asyncDispose]())
			]);
		}
	});

	it('projects aggregate task outputs only after every selected path settles', async () => {
		const host = { state: { name: '', accent: '' } };
		const settlements: Promise<unknown>[] = [];
		const frame = createServerComponentExecutionFrame(host, {
			observe: (settlement) => settlements.push(settlement)
		});
		try {
			activateServerComponentTaskForHost(
				host,
				[
					[],
					[
						[0, ['name']],
						[1, ['accent']]
					],
					'blocking',
					'project'
				],
				'project',
				async () => {
					await Promise.resolve();
					host.state.name = 'Northwind';
					host.state.accent = '#2255aa';
				}
			);
			const token = serverComponentExecutionValueForHost(
				host,
				['name', 'accent'],
				createExpression(() => ({
					name: host.state.name,
					accent: host.state.accent
				}))
			);
			const source = serverComponentDependencyForValue(token)!;
			expect(source.read().status).toBe('pending');
			await Promise.all(settlements);
			expect(source.read()).toMatchObject({
				status: 'available',
				value: { name: 'Northwind', accent: '#2255aa' }
			});
		} finally {
			await frame[Symbol.asyncDispose]();
		}
	});

	it('aborts active work, runs cleanup, and releases host lookup on disposal', async () => {
		const host = { state: { value: 'pending' } };
		let cleanupCalls = 0;
		let observedSignal: AbortSignal | undefined;
		const frame = createServerComponentExecutionFrame(host, {
			observe: () => undefined,
			trackTaskIdentities: true
		});
		expect(Object.keys(host)).toEqual(['state']);
		expect(Object.getOwnPropertySymbols(host)).toContain(
			Symbol.for('@exactjs/server-component-execution-frame')
		);
		activateServerComponentTaskForHost(host, valueSlice, 'pending', async (task) => {
			observedSignal = task.signal;
			task.cleanup(() => {
				cleanupCalls++;
			});
			await new Promise<void>((_resolve, reject) =>
				task.signal.addEventListener('abort', () => reject(task.signal.reason), { once: true })
			);
		});
		const selectedWait = expect(frame.blockingWork(new Set(['pending']))).rejects.toMatchObject({
			name: 'AbortError'
		});
		await Promise.resolve(frame[Symbol.asyncDispose]());
		await selectedWait;
		expect(observedSignal?.aborted).toBe(true);
		expect(cleanupCalls).toBe(1);
		expect(serverComponentExecutionValueForHost(host, 'value', 'released')).toBe('released');
		expect(Object.getOwnPropertySymbols(host)).not.toContain(
			Symbol.for('@exactjs/server-component-execution-frame')
		);
	});

	it('publishes registered direct contexts and successfully settled continuation ids', async () => {
		const Status = createContext<{ message: string }>('status');
		const host = {
			contexts: new Map<symbol, unknown>(),
			state: { value: 'pending' }
		};
		const settlements: Promise<unknown>[] = [];
		const frame = createServerComponentExecutionFrame(host, {
			observe: (settlement) => settlements.push(settlement)
		});
		try {
			registerServerComponentContinuationContextsForHost(host, [{ name: 'Status', token: Status }]);
			activateServerComponentTaskForHost(host, valueSlice, 'load', async () => {
				host.contexts.set(Status.id, { message: 'ready' });
				host.state.value = 'ready';
			});
			await Promise.all(settlements);
			expect(serverComponentContinuationContextValuesForHost(host, ['Status'])).toEqual({
				Status: { message: 'ready' }
			});
			expect(settledServerComponentContinuationIdsForHost(host)).toEqual(['load']);
		} finally {
			await frame[Symbol.asyncDispose]();
		}
	});

	it('scopes compiler receipt issuance synchronously and restores nested issuers', () => {
		const issued: string[] = [];
		withServerComponentIssuer(
			(value) => issued.push(`outer:${String(value)}`),
			() => {
				issueServerComponentReceipt('one');
				withServerComponentIssuer(
					(value) => issued.push(`inner:${String(value)}`),
					() => issueServerComponentReceipt('two')
				);
				issueServerComponentReceipt('three');
			}
		);
		issueServerComponentReceipt('outside');
		expect(issued).toEqual(['outer:one', 'inner:two', 'outer:three']);
	});

	it('awaits and cancels request-local timer work without a durable task frame', async () => {
		const completed = new AbortController();
		await expect(
			awaitServerComponentTask(completed.signal, Promise.resolve('ready'))
		).resolves.toBe('ready');

		const cancelled = new AbortController();
		let fired = false;
		serverComponentTaskTimeout(
			cancelled.signal,
			() => {
				fired = true;
			},
			1
		);
		const pending = awaitServerComponentTask(cancelled.signal, new Promise<void>(() => undefined));
		cancelled.abort('request complete');
		await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(fired).toBe(false);
	});
});
