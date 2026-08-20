import { describe, expect, it } from 'vitest';
import { defineConfig, type ExactPluginConfigTransform } from './index.js';

describe('@exactjs/config types', () => {
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

	it('validates and freezes the shared configuration shape', () => {
		const config = defineConfig({
			pluginDiscovery: { mode: 'trusted', trustedPrefixes: ['@acme/'] },
			componentLibraries: { mode: 'root', deny: ['@untrusted/component'] },
			debug: { catalog: 'auto' }
		});

		expect(Object.isFrozen(config)).toBe(true);
		expect(Object.isFrozen(config.componentLibraries?.deny)).toBe(true);
		expect(() => (config.debug!.catalog = true)).toThrow();
	});

	it('rejects invalid built-in options before consumers can diverge', () => {
		expect(() =>
			defineConfig({ componentLibraries: { mode: 'trusted', typo: true } } as never)
		).toThrow('contains unknown option "typo"');
		expect(() =>
			defineConfig({ pluginDiscovery: { mode: 'all', trustedPrefixes: [] } } as never)
		).toThrow('requires plugin discovery mode "trusted"');
		expect(() => defineConfig({ plugins: { example: {} } } as never)).toThrow(
			'must be a configuration function or false'
		);
	});
});
