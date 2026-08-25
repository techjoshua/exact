import { describe, expect, it } from 'vitest';
import {
	activateServerComponentTaskForHost,
	awaitServerComponentTask,
	createServerComponentExecutionFrame,
	issueServerComponentVNode,
	serverComponentDependencyForValue,
	serverComponentExecutionValueForHost,
	serverComponentTaskTimeout,
	withServerComponentVNodeIssuer,
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

	it('aborts active work, runs cleanup, and releases host lookup on disposal', async () => {
		const host = { state: { value: 'pending' } };
		let cleanupCalls = 0;
		let observedSignal: AbortSignal | undefined;
		const frame = createServerComponentExecutionFrame(host, { observe: () => undefined });
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
		await Promise.resolve(frame[Symbol.asyncDispose]());
		expect(observedSignal?.aborted).toBe(true);
		expect(cleanupCalls).toBe(1);
		expect(serverComponentExecutionValueForHost(host, 'value', 'released')).toBe('released');
		expect(Object.getOwnPropertySymbols(host)).not.toContain(
			Symbol.for('@exactjs/server-component-execution-frame')
		);
	});

	it('scopes compiler VNode issuance synchronously and restores nested issuers', () => {
		const issued: string[] = [];
		withServerComponentVNodeIssuer(
			(value) => issued.push(`outer:${String(value)}`),
			() => {
				issueServerComponentVNode('one');
				withServerComponentVNodeIssuer(
					(value) => issued.push(`inner:${String(value)}`),
					() => issueServerComponentVNode('two')
				);
				issueServerComponentVNode('three');
			}
		);
		issueServerComponentVNode('outside');
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
