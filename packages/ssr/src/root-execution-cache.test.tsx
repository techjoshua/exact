import { describe, expect, it } from 'vitest';
import {
	exactComponentContract,
	type ExactComponentContract
} from '@exactjs/core/framework/component-contracts';
import { ssrRootExecutionBlueprint } from './render/root-execution-cache.js';
import {
	CachedDynamic,
	CachedRoot,
	ReplacementDynamic
} from './root-execution-cache.fixtures.test.js';

describe('SSR root component blueprint cache', () => {
	it('reuses root and dynamic contracts while detecting replaced authority', () => {
		const cache = ssrRootExecutionBlueprint(CachedRoot);
		expect(ssrRootExecutionBlueprint(CachedRoot)).toBe(cache);
		const root = cache.resolve(CachedRoot);
		expect(cache.resolve(CachedRoot)).toBe(root);
		const dynamic = cache.resolve(CachedDynamic);
		expect(cache.resolve(CachedDynamic)).toBe(dynamic);

		const replacementContract = (
			ReplacementDynamic as typeof ReplacementDynamic & {
				[exactComponentContract]: ExactComponentContract;
			}
		)[exactComponentContract];
		(
			CachedDynamic as typeof CachedDynamic & {
				[exactComponentContract]: ExactComponentContract;
			}
		)[exactComponentContract] = replacementContract;
		const replacement = cache.resolve(CachedDynamic);
		expect(replacement).not.toBe(dynamic);
		expect(replacement.contract).toBe(replacementContract);
	});
});
