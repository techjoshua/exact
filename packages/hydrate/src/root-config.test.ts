// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { readPublishedRootProps, resolveRootHydrateOptions } from './root-config.js';

describe('hydration-only config projection', () => {
	it('reads only root hydration fields through the bounded decoder', () => {
		const container = configContainer({
			buildKey: 'build-one',
			executionRoot: 'page',
			state: { ready: true },
			wallClockSnapshot: 42
		});
		expect(resolveRootHydrateOptions(container, {})).toMatchObject({
			buildKey: 'build-one',
			executionRoot: 'page',
			state: { ready: true },
			wallClockSnapshot: 42
		});
	});

	it('reads the authoritative published root props from hydration state', () => {
		const container = configContainer({ state: { initialData: { incidents: [1, 2] } } });
		expect(readPublishedRootProps(container)).toEqual({
			initialData: { incidents: [1, 2] }
		});
		expect(() => readPublishedRootProps(configContainer({ state: 'invalid' }))).toThrow(
			'Missing or malformed eXact published root props'
		);
	});

	it('accepts only the compiler-published markerless-root proof', () => {
		expect(resolveRootHydrateOptions(configContainer({ m: 1 }), {})).toMatchObject({
			markerlessRoot: true,
			allowMarkerless: true
		});
		expect(
			resolveRootHydrateOptions(configContainer({ m: true }), {}).markerlessRoot
		).toBeUndefined();
	});

	it('reuses the bounded root decode when root props are read before hydration', () => {
		const container = configContainer({ state: { ready: true } });
		const parse = vi.spyOn(JSON, 'parse');
		try {
			const props = readPublishedRootProps(container);
			const options = resolveRootHydrateOptions(container, {});
			expect(options.state).toBe(props);
			expect(parse).toHaveBeenCalledTimes(1);
		} finally {
			parse.mockRestore();
		}
	});

	it('fails closed when complete-runtime transport fields enter the narrow artifact', () => {
		const container = configContainer({ buildKey: 'build-one', endpoint: '/operations' });
		const resolved = resolveRootHydrateOptions(container, {});
		expect(resolved.buildKey).toBeUndefined();
		expect(resolved.endpoint).toBeUndefined();
	});

	it('preserves build mismatch enforcement', () => {
		const container = configContainer({ buildKey: 'server-build' });
		expect(() => resolveRootHydrateOptions(container, { buildKey: 'client-build' })).toThrow(
			'Client and server eXact build identities do not match'
		);
	});

	it('accepts only bounded, unique indexes in compact component resumptions', () => {
		const valid = configContainer({
			resumptions: [
				[
					'component:Counter',
					[
						[0, 7],
						['label', 'ready']
					],
					[],
					['task:ready']
				]
			]
		});
		expect(resolveRootHydrateOptions(valid, {}).resumptions).toEqual([
			{
				componentId: 'component:Counter',
				values: [
					[0, 7],
					['label', 'ready']
				],
				contexts: [],
				settledContinuations: ['task:ready']
			}
		]);

		for (const resumptions of [
			[['component:Counter', [[-1, 7]]]],
			[
				[
					'component:Counter',
					[
						[0, 7],
						[0, 8]
					]
				]
			],
			[['component:Counter', [['@0', 7]]]]
		]) {
			const invalid = configContainer({ resumptions });
			expect(resolveRootHydrateOptions(invalid, {}).resumptions).toBeUndefined();
		}
	});
});

function configContainer(config: Record<string, unknown>): HTMLElement {
	const container = document.createElement('main');
	const script = document.createElement('script');
	script.id = '__exact_hydration';
	script.type = 'application/json';
	script.textContent = JSON.stringify(config);
	container.append(script);
	return container;
}
