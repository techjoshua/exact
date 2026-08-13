import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryObjects } from 'node:v8';
import { clearQuoteCache } from '../src/providers/registry.js';
import { createShippingSsrFixture } from './test-support/shipping-ssr-fixture.js';

const fixture = createShippingSsrFixture();
type RuntimeConstructor = abstract new (...args: never[]) => object;
let componentConstructor: RuntimeConstructor | undefined;
let effectScopeConstructor: RuntimeConstructor | undefined;

describe('shipping SSR retained heap', () => {
	beforeAll(() => {
		if (!globalThis.gc) throw new Error('Run this manual test with Node --expose-gc');
		clearQuoteCache();
	});

	afterAll(async () => {
		await fixture.dispose();
	});

	it('plateaus after compiler-generated root warmup', async () => {
		const batchSize = 200;
		const batchCount = 5;
		for (let index = 0; index < 100; index++) await renderShippingPage();
		const baseline = retainedHeap();
		for (let batch = 1; batch <= batchCount; batch++) {
			for (let index = 0; index < batchSize; index++) await renderShippingPage();
			const retained = retainedHeap();
			const components = liveCount(componentConstructor);
			const scopes = liveCount(effectScopeConstructor);
			console.info(
				`shipping SSR batch ${batch}: retained=${retained} components=${components} scopes=${scopes}`
			);
			expect(components).toBe(0);
			expect(scopes).toBe(0);
		}
		const retained = retainedHeap();
		const growth = retained - baseline;
		console.info(
			`shipping SSR retained heap: baseline=${baseline} retained=${retained} growth=${growth}`
		);

		// This is deliberately a broad leak detector, not a machine-independent memory budget.
		// The exact owner counts detect lifecycle leaks; the heap cap catches retained values
		// that do not preserve their owning framework class.
		expect(growth).toBeLessThan(2 * 1024 * 1024);
	}, 120_000);
});

/** Renders and fully consumes one compiler-generated hydratable shipping root. */
async function renderShippingPage(): Promise<void> {
	await fixture.render((instance) => {
		componentConstructor ??= instance.constructor as RuntimeConstructor;
		effectScopeConstructor ??= instance.scope.constructor as RuntimeConstructor;
	});
}

/** Samples retained JavaScript heap after repeated full collections. */
function retainedHeap(): number {
	for (let pass = 0; pass < 4; pass++) globalThis.gc!();
	return process.memoryUsage().heapUsed;
}

/** Counts live instances without retaining the queried objects. */
function liveCount(constructor: RuntimeConstructor | undefined): number {
	return constructor ? queryObjects(constructor, { format: 'count' }) : 0;
}
