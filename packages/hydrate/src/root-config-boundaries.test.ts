// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { resolveRootHydrateOptions } from './root-config.js';

function root(value: unknown): HTMLElement {
	const container = document.createElement('main');
	const script = document.createElement('script');
	script.id = '__exact_hydration';
	script.type = 'application/json';
	script.textContent = JSON.stringify(value);
	container.append(script);
	return container;
}
const authorization = { protocol: 1 as const, buildKey: 'build', fingerprint: 'fingerprint' };
afterEach(() => document.body.replaceChildren());

describe('hydration root configuration boundaries', () => {
	it('retains build and authorization checks when options override published values', () => {
		const container = root({
			pluginRegistryFingerprint: 'plugins',
			buildKey: 'build',
			componentAuthorization: authorization
		});
		expect(
			resolveRootHydrateOptions(container, { componentAuthorization: authorization })
		).toMatchObject({
			headers: { 'X-Exact-Component-Authorization': 'fingerprint' }
		});
		expect(() =>
			resolveRootHydrateOptions(container, {
				clientPluginRegistryFingerprint: 'other'
			})
		).toThrow('plugin registry fingerprints');
		expect(() =>
			resolveRootHydrateOptions(container, {
				componentAuthorization: { ...authorization, fingerprint: 'other' }
			})
		).toThrow('authorization fingerprints');
		expect(() =>
			resolveRootHydrateOptions(root({}), {
				buildKey: 'other',
				componentAuthorization: authorization
			})
		).toThrow('hydration build key');
		expect(
			resolveRootHydrateOptions(
				root({ buildKey: 'other', componentAuthorization: authorization }),
				{}
			)
		).toEqual({});
	});

	it('decodes every supported compact field without changing explicit options', () => {
		const table = [1, [['component', ['count'], [['target', 1]]]]];
		const container = root([
			1,
			16345,
			'plugins',
			{ count: 1 },
			[],
			{ theme: 'dark' },
			42,
			table,
			'execution',
			'binding',
			'build',
			authorization
		]);
		expect(resolveRootHydrateOptions(container, {})).toMatchObject({
			state: { count: 1 },
			markerlessRoot: true,
			publicContexts: { theme: 'dark' },
			wallClockSnapshot: 42,
			hydrationTable: table,
			executionRoot: 'execution',
			binding: 'binding',
			buildKey: 'build',
			componentAuthorization: authorization
		});
		const state = { count: 2 };
		expect(resolveRootHydrateOptions(container, { state, allowMarkerless: false }).state).toBe(
			state
		);
		expect(resolveRootHydrateOptions(container, { allowMarkerless: false }).allowMarkerless).toBe(
			false
		);
	});

	it.each([
		null,
		1,
		[1, '8'],
		[1, -1],
		[1, 0.5],
		[1, 2],
		[1, 4],
		[1, 32],
		[1, 16384],
		[1, 8],
		[1, 0, 1]
	])('rejects a malformed envelope %j', (value) => {
		expect(resolveRootHydrateOptions(root(value), {})).toEqual({});
	});

	it('revalidates changed source and stricter limits after a cached decode', () => {
		const container = root({ state: { label: 'éééé' } });
		const first = resolveRootHydrateOptions(container, {});
		expect(first.state).toEqual({ label: 'éééé' });
		expect(
			resolveRootHydrateOptions(container, { configLimits: { maxNodes: 1 } }).state
		).toBeUndefined();
		const script = container.querySelector('script')!;
		const source = script.textContent!;
		expect(
			resolveRootHydrateOptions(container, {
				configLimits: { maxBytes: source.length }
			}).state
		).toBeUndefined();
		expect(resolveRootHydrateOptions(container, {}).state).toEqual(first.state);
		script.textContent = JSON.stringify({ state: { label: 'new' } });
		expect(resolveRootHydrateOptions(container, {}).state).toEqual({ label: 'new' });
		script.textContent = '{';
		expect(resolveRootHydrateOptions(container, {}).state).toBeUndefined();
	});

	it('invalidates a relocated cached script and confines shadow-root configuration', () => {
		const container = root({ state: { owner: 'first' } });
		expect(resolveRootHydrateOptions(container, {}).state).toEqual({ owner: 'first' });
		const old = container.querySelector('script')!;
		const other = document.createElement('aside');
		other.append(old);
		const replacement = root({ state: { owner: 'replacement' } }).querySelector('script')!;
		container.append(replacement);
		expect(resolveRootHydrateOptions(container, {}).state).toEqual({ owner: 'replacement' });
		document.body.append(other);
		const host = document.createElement('div');
		document.body.append(host);
		const shadow = host.attachShadow({ mode: 'open' });
		const shadowContainer = document.createElement('main');
		shadow.append(shadowContainer);
		expect(resolveRootHydrateOptions(shadowContainer, {})).toEqual({});
		const own = root({ state: { owner: 'shadow' } }).querySelector('script')!;
		shadowContainer.append(own);
		expect(resolveRootHydrateOptions(shadowContainer, {}).state).toEqual({ owner: 'shadow' });
	});
});
