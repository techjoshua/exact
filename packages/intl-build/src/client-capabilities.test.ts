import { describe, expect, it } from 'vitest';
import { createIntlClientCapabilityBootstrap } from './client-capabilities.js';

describe('intl client capability providers', () => {
	it('emits no bootstrap for native capabilities or server builds', () => {
		expect(
			createIntlClientCapabilityBootstrap(['temporal'], { temporal: { kind: 'native' } }, 'client')
		).toBe('');
		expect(
			createIntlClientCapabilityBootstrap(
				['temporal'],
				{ temporal: { kind: 'module', specifier: 'temporal-polyfill/global' } },
				'server'
			)
		).toBe('');
	});

	it('emits one static side-effect import for a bundled module provider', () => {
		expect(
			createIntlClientCapabilityBootstrap(
				['temporal', 'temporal'],
				{ temporal: { kind: 'module', specifier: 'temporal-polyfill/global' } },
				'client'
			)
		).toBe('import "temporal-polyfill/global";\n');
	});

	it('emits a pinned and globally deduplicated CDN bootstrap', () => {
		const code = createIntlClientCapabilityBootstrap(
			['temporal'],
			{
				temporal: {
					kind: 'cdn',
					url: 'https://cdn.example.test/temporal.js',
					integrity: 'sha384-YWJjZA=='
				}
			},
			'client'
		);
		expect(code).toContain('Symbol.for("@exactjs/intl-capability:temporal:');
		expect(code).toContain('script.integrity = "sha384-YWJjZA=="');
		expect(code).toContain('script.crossOrigin = "anonymous"');
		expect(code).toContain('await (() => {');
	});

	it('rejects remote module imports and unpinned or insecure CDN scripts', () => {
		expect(() =>
			createIntlClientCapabilityBootstrap(
				['temporal'],
				{ temporal: { kind: 'module', specifier: 'https://cdn.example.test/polyfill.js' } },
				'client'
			)
		).toThrow(/invalid module specifier/u);
		expect(() =>
			createIntlClientCapabilityBootstrap(
				['temporal'],
				{
					temporal: {
						kind: 'cdn',
						url: 'http://cdn.example.test/polyfill.js',
						integrity: ''
					}
				},
				'client'
			)
		).toThrow(/pinned HTTPS CDN provider/u);
	});
});
