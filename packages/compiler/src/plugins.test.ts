import type { ExactPreparedCompilerRegistry } from '@exactjs/plugin-api';
import { describe, expect, it } from 'vitest';
import { analyzeSource } from './index.js';

describe('compiler plugins', () => {
	it('rejects unknown namespaced directives without a prepared registry', () => {
		expect(() =>
			analyzeSource(
				`
      /** @exact secrets.source */
      export const apiKey = "hidden";
    `,
				{ filename: 'config.ts' }
			)
		).toThrow("unknown @exact directive namespace 'secrets'");
	});

	it('analyzes plain TypeScript and emits namespaced analysis data', () => {
		const registry: ExactPreparedCompilerRegistry = {
			fingerprint: 'registry-one',
			plugins: {
				'@exactjs/secrets': {
					packageName: '@exactjs/secrets',
					version: '1.0.0',
					protocolVersion: '1.0.0',
					required: true,
					cacheKey: { policy: 1 },
					extension: {
						namespace: 'secrets',
						directives: ['source', 'sink'],
						analyzeModule(view) {
							return {
								diagnostics: view.directives.map(() => ({
									severity: 'info',
									code: 'source',
									message: 'secret source registered'
								})),
								analysisData: {
									sources: view.directives.filter((value) => value.name === 'source').length
								}
							};
						}
					}
				}
			}
		};
		const analysis = analyzeSource(
			`
      /** @exact secrets.source */
      export const apiKey = "hidden";
    `,
			{ filename: 'config.ts', pluginRegistry: registry }
		);
		expect(analysis.pluginRegistry?.fingerprint).toBe('registry-one');
		expect(analysis.pluginData?.['@exactjs/secrets']).toEqual({ sources: 1 });
		expect(analysis.diagnostics).toContain(
			'info: [@exactjs/secrets/source] secret source registered'
		);
	});
});
