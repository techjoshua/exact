import { describe, expect, it } from 'vitest';
import {
	generateExactClientBindingsBootstrap,
	generateProvidedPackageBootstrap,
	generateProvidedPackageBridge,
	generateRemoteEntryModule,
	planProvidedPackageBridge
} from './artifacts.js';

describe('provided-package artifact generation', () => {
	it('generates static page imports and exact-key registrations in source order', () => {
		const source = generateProvidedPackageBootstrap(['@exactjs/core', '@company/contexts']);
		expect(source).toContain('import * as __exactProvided0 from "@exactjs/core";');
		expect(source).toContain('__exactRegistry.register("@company/contexts", __exactProvided1);');
		expect(source.indexOf('@exactjs/core')).toBeLessThan(source.indexOf('@company/contexts'));
	});

	it('generates only the requested default and named export shape', () => {
		const source = generateProvidedPackageBridge({
			key: '@company/design-system',
			hasDefault: true,
			exportNames: ['Button', 'Dialog', 'Button']
		});
		expect(source).toContain('.require("@company/design-system")');
		expect(source).not.toContain("from '@exactjs/hydrate'");
		expect(source).toContain('export { __exactDefault as default };');
		expect(source).toContain('export { __exactExport0 as Button };');
		expect(source).toContain('export { __exactExport1 as Dialog };');
		expect(source.match(/ as Button/g)).toHaveLength(1);
	});

	it('generates browser-only bindings with statically imported resolvers', () => {
		const source = generateExactClientBindingsBootstrap(
			[
				[
					'billing',
					{
						clientEntry: 'https://cdn.example.test/billing.js',
						clientEntryResolver: './src/resolve-billing.ts'
					}
				]
			],
			{ applicationRoot: '/workspace/page' }
		);
		expect(source).toContain('registerExactRemoteClientBindings');
		expect(source).toContain('/workspace/page/src/resolve-billing.ts');
		expect(source).toContain('resolveClientEntry: __exactResolveEntry0');
		expect(source).toContain('https://cdn.example.test/billing.js');
		expect(source).not.toContain('endpoint');
	});

	it('plans namespace, named, default, and side-effect usage without version policy', () => {
		expect(
			planProvidedPackageBridge('@company/contexts', [
				{ kind: 'default' },
				{ kind: 'named', imported: 'useAccount' },
				{ kind: 'namespace', exportNames: ['AccountContext', 'useAccount'] },
				{ kind: 'side-effect' }
			])
		).toEqual({
			key: '@company/contexts',
			hasDefault: true,
			exportNames: ['AccountContext', 'useAccount']
		});
	});

	it('rejects dynamic imports and re-exports with targeted diagnostics', () => {
		expect(() => planProvidedPackageBridge('@company/contexts', [{ kind: 'dynamic' }])).toThrow(
			/Dynamic imports.*not supported/
		);
		expect(() => planProvidedPackageBridge('@company/contexts', [{ kind: 're-export' }])).toThrow(
			/Re-exports.*not supported/
		);
	});

	it('generates a canonical remote module with only build, root, component, and registration', () => {
		const source = generateRemoteEntryModule({
			buildKey: '0123456789abcdef0123456789abcdef01234567',
			root: '@company/billing#./BillingArea',
			componentImport: '\0exact:remote/0/component',
			registrationImport: '\0exact:remote/0/registration'
		});
		expect(source).toContain('buildKey: "0123456789abcdef0123456789abcdef01234567"');
		expect(source).toContain('root: "@company/billing#./BillingArea"');
		expect(source).not.toContain('contractVersion');
		expect(source).not.toContain('revision');
	});
});
