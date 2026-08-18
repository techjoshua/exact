// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { resolveRootHydrateOptions } from './root-config.js';

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
