import { describe, expect, it } from 'vitest';
import { defineConfig, type ExactPluginConfigTransform } from './index.js';

describe('@exactjs/config types', () => {
	it('validates advisory analysis policy without replacing caller-owned values', () => {
		for (const threshold of [undefined, false, 1, 4096, Number.MAX_SAFE_INTEGER] as const) {
			const analysis = { estimatedCostWarningThreshold: threshold };
			expect(defineConfig({ analysis }).analysis).toBe(analysis);
		}
		for (const threshold of [0, -1, 1.5, true, null, '4096', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			expect(() => defineConfig({ analysis: { estimatedCostWarningThreshold: threshold } } as never))
				.toThrow('must be a positive safe integer or false');
		}
		expect(() => defineConfig({ analysis: { typo: true } } as never)).toThrow('contains unknown option');
	});

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

	it('validates the shared shape while retaining ordinary authored aliases', () => {
		const deny = ['@untrusted/component'];
		const config = defineConfig({
			pluginDiscovery: { mode: 'trusted', trustedPrefixes: ['@acme/'] },
			componentLibraries: { mode: 'root', deny },
			debug: { catalog: 'auto' }
		});

		const runtimeMutableDebug: { catalog: boolean | 'auto' } = config.debug;
		runtimeMutableDebug.catalog = true;
		deny.push('@other/component');
		expect(config.debug.catalog).toBe(true);
		expect(config.componentLibraries.deny).toBe(deny);
		expect(config.componentLibraries.deny).toHaveLength(2);
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
