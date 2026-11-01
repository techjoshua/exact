import { describe, expect, it } from 'vitest';
import {
	disposeExactPluginResources,
	initializeExactPluginResources,
	processExactOutput,
	processExactOutputSync,
	validateExactRuntimeExtensions
} from './index.js';

describe('plugin runtime phases', () => {
	it('runs all transformations before every final validator and collects failures', () => {
		const order: string[] = [];
		expect(() =>
			processExactOutputSync('start', { kind: 'html' }, [
				{
					transform(value) {
						order.push('transform-a');
						return `${value}-a`;
					},
					validate(value) {
						order.push(`validate-a:${value}`);
						throw new Error('a failed');
					}
				},
				{
					transform(value) {
						order.push('transform-b');
						return `${value}-b`;
					},
					validate(value) {
						order.push(`validate-b:${value}`);
						throw new Error('b failed');
					}
				}
			])
		).toThrow(AggregateError);
		expect(order).toEqual([
			'transform-a',
			'transform-b',
			'validate-a:start-a-b',
			'validate-b:start-a-b'
		]);
	});

	it('disposes partially initialized resources in reverse order', async () => {
		const order: string[] = [];
		await expect(
			initializeExactPluginResources(
				[
					{
						initializeApplication() {
							order.push('init-a');
							return {
								dispose: () => {
									order.push('dispose-a');
								}
							};
						}
					},
					{
						initializeApplication() {
							order.push('init-b');
							return {
								dispose: () => {
									order.push('dispose-b');
								}
							};
						}
					},
					{
						initializeApplication() {
							throw new Error('failed');
						}
					}
				],
				'application',
				{
					applicationRoot: '/app',
					environment: 'test',
					signal: new AbortController().signal
				}
			)
		).rejects.toThrow('failed');
		expect(order).toEqual(['init-a', 'init-b', 'dispose-b', 'dispose-a']);
	});

	it('disposes a completed resource set in reverse order', async () => {
		const order: string[] = [];
		await disposeExactPluginResources([
			{
				dispose: () => {
					order.push('a');
				}
			},
			{
				dispose: () => {
					order.push('b');
				}
			}
		]);
		expect(order).toEqual(['b', 'a']);
	});

	it('awaits asynchronous transforms before validating the final output', async () => {
		const observations: string[] = [];
		const result = await processExactOutput('start', { kind: 'html' }, [
			{
				async transform(value) {
					await Promise.resolve();
					return `${value}-transformed`;
				}
			},
			{
				validate(value) {
					observations.push(value);
					return undefined;
				}
			}
		]);

		expect(result).toBe('start-transformed');
		expect(observations).toEqual(['start-transformed']);
	});

	it('collects asynchronous validator failures and invalid return values', async () => {
		let failure: unknown;
		try {
			await processExactOutput('output', { kind: 'html' }, [
				{
					validate() {
						throw new Error('first failure');
					}
				},
				{
					async validate() {
						await Promise.resolve();
						return 'invalid' as never;
					}
				}
			]);
		} catch (error) {
			failure = error;
		}

		expect(failure).toBeInstanceOf(AggregateError);
		expect((failure as AggregateError).errors).toHaveLength(2);
		expect((failure as Error).message).toContain('html output validation failed');
	});

	it('rejects asynchronous hooks in the synchronous output pipeline', () => {
		expect(() =>
			processExactOutputSync('output', { kind: 'html' }, [{ transform: async (value) => value }])
		).toThrow('Async output transform cannot run in synchronous html output');
		expect(() =>
			processExactOutputSync('output', { kind: 'html' }, [{ validate: async () => undefined }])
		).toThrow(AggregateError);
	});

	it('initializes request resources and ignores extensions without a factory', async () => {
		const resources = await initializeExactPluginResources(
			[
				{},
				{
					initializeRequest() {
						return { dispose() {} };
					}
				}
			],
			'request',
			{
				applicationRoot: '/app',
				environment: 'test',
				signal: new AbortController().signal
			}
		);

		expect(resources).toHaveLength(1);
	});

	it('attempts every disposal and reports all failures', async () => {
		const order: string[] = [];
		let failure: unknown;
		try {
			await disposeExactPluginResources([
				{
					dispose() {
						order.push('a');
						throw new Error('a failed');
					}
				},
				{
					dispose() {
						order.push('b');
						throw new Error('b failed');
					}
				}
			]);
		} catch (error) {
			failure = error;
		}

		expect(order).toEqual(['b', 'a']);
		expect(failure).toBeInstanceOf(AggregateError);
		expect((failure as AggregateError).errors).toHaveLength(2);
	});

	it('enforces the runtime validation return contract', async () => {
		await expect(
			validateExactRuntimeExtensions([
				{},
				{
					async validate() {
						await Promise.resolve();
					}
				}
			])
		).resolves.toBeUndefined();
		await expect(
			validateExactRuntimeExtensions([
				{
					validate() {
						return false as never;
					}
				}
			])
		).rejects.toThrow('validate() must return undefined');
	});
});

// A synchronous rejection must also observe settlement of the forbidden async result.
describe('synchronous plugin output rejection ownership', () => {
	it.each(['transform', 'validate'] as const)('observes a rejected %s promise', async (phase) => {
		const rejection = new Error('forbidden asynchronous failure');
		expect(() =>
			processExactOutputSync('output', { kind: 'html' }, [
				{
					[phase]: () => Promise.reject(rejection)
				}
			])
		).toThrow(phase === 'transform' ? Error : AggregateError);
		await new Promise((resolve) => setTimeout(resolve, 0));
	});

	it.each(['transform', 'validate'] as const)(
		'assimilates a rejecting %s thenable',
		async (phase) => {
			let observed = false;
			const result = {
				then(_resolve: unknown, reject: (cause: Error) => void) {
					observed = true;
					reject(new Error('foreign asynchronous failure'));
				}
			};
			expect(() =>
				processExactOutputSync('output', { kind: 'html' }, [
					{
						[phase]: () => result as never
					}
				])
			).toThrow(phase === 'transform' ? Error : AggregateError);
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(observed).toBe(true);
		}
	);
});
