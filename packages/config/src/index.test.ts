import { describe, expect, it } from 'vitest';
import type { ExactPluginConfigTransform } from './index.js';

describe('@exact/config types', () => {
	it('uses undefined rather than void for mutation retention', async () => {
		const mutate: ExactPluginConfigTransform<{ values: string[] }> = async (config) => {
			config.values.push('updated');
			return undefined;
		};
		const value = { values: [] as string[] };
		expect(await mutate(value, {} as never)).toBeUndefined();
		expect(value.values).toEqual(['updated']);

		// @ts-expect-error unrelated returns must not be accepted through void assignability
		const invalid: ExactPluginConfigTransform<{ values: string[] }> = () => 42;
		expect(invalid).toBeTypeOf('function');
	});
});
