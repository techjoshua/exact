// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
	exactComponentContract,
	type AnyExactComponentCallable
} from '@exactjs/core/framework/component-contracts';
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

	it('decodes component-bound positional root props into authored objects', () => {
		const component = Object.assign(() => undefined, {
			[exactComponentContract]: {
				artifact: {
					target: 'client',
					id: 'component:Root',
					serialization: [1, 'rows', [2, [1, 'id', 0]], 'label', 0]
				}
			}
		}) as unknown as AnyExactComponentCallable;
		const container = configContainer({
			state: ['component:Root', [[['first'], ['second']], 'queue']]
		});
		expect(readPublishedRootProps(component, container)).toEqual({
			rows: [{ id: 'first' }, { id: 'second' }],
			label: 'queue'
		});
		expect(resolveRootHydrateOptions(container, {}).state).toEqual({
			rows: [{ id: 'first' }, { id: 'second' }],
			label: 'queue'
		});
		expect(() =>
			readPublishedRootProps(
				component,
				configContainer({ state: ['component:Other', [[['first']], 'queue']] })
			)
		).toThrow('Missing or malformed eXact published root props');
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

	it('decodes only a complete versioned direct envelope tuple', () => {
		const resumptions = [['component:Counter', [[0, 7]]]];
		expect(
			resolveRootHydrateOptions(configContainer([1, 88, { ready: true }, resumptions]), {})
		).toMatchObject({
			state: { ready: true },
			markerlessRoot: true,
			allowMarkerless: true,
			resumptions
		});

		for (const malformed of [
			[2, 0],
			[1, 16_384],
			[1, 8],
			[1, 0, 'trailing']
		])
			expect(resolveRootHydrateOptions(configContainer(malformed), {})).toEqual({});
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
			[
				'component:Counter',
				[
					[0, 7],
					['label', 'ready']
				],
				[],
				['task:ready']
			]
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

function configContainer(config: unknown): HTMLElement {
	const container = document.createElement('main');
	const script = document.createElement('script');
	script.id = '__exact_hydration';
	script.type = 'application/json';
	script.textContent = JSON.stringify(config);
	container.append(script);
	return container;
}
