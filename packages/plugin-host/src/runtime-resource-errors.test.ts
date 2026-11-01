import { describe, expect, it } from 'vitest';
import { initializeExactPluginResources } from './runtime.js';

const context = {
	applicationRoot: '/app',
	environment: 'test',
	signal: new AbortController().signal
};

describe.each(['application', 'request'] as const)('%s resource rollback diagnostics', (scope) => {
	it.each([
		new Error('initialization failed'),
		Object.freeze(new Error('frozen failure')),
		undefined
	])('retains the initialization failure when rollback also fails (%s)', async (primary) => {
		const factory = scope === 'application' ? 'initializeApplication' : 'initializeRequest';
		const cleanup = new Error('rollback failed');
		const order: string[] = [];
		const failure = await initializeExactPluginResources(
			[
				{
					[factory]: () => ({
						dispose() {
							order.push('first');
						}
					})
				},
				{
					[factory]: () => ({
						dispose() {
							order.push('second');
							throw cleanup;
						}
					})
				},
				{
					[factory]: () => {
						throw primary;
					}
				}
			],
			scope,
			context
		).catch((error: unknown) => error);
		expect(order).toEqual(['second', 'first']);
		expect(failure).toBeInstanceOf(AggregateError);
		expect((failure as AggregateError).cause).toBe(primary);
		expect((failure as AggregateError).errors[0]).toBe(primary);
		expect((failure as AggregateError).errors[1]).toBeInstanceOf(AggregateError);
		expect(((failure as AggregateError).errors[1] as AggregateError).errors).toEqual([cleanup]);
		await expect(initializeExactPluginResources([], scope, context)).resolves.toEqual([]);
	});

	it('preserves the original thrown value when rollback succeeds', async () => {
		const factory = scope === 'application' ? 'initializeApplication' : 'initializeRequest';
		const primary = Object.freeze(new Error('initialization failed'));
		await expect(
			initializeExactPluginResources(
				[
					{ [factory]: () => ({ dispose() {} }) },
					{
						[factory]: () => {
							throw primary;
						}
					}
				],
				scope,
				context
			)
		).rejects.toBe(primary);
	});
});
