import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createExactRemoteArtifactPlan } from './build.js';
import { createExactRemoteRollupAdapter } from './rollup.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';

describe('Rollup remote artifact adapter', () => {
	it('emits canonical entries, virtual modules, bridges, and discovered output paths', async () => {
		const plan = createExactRemoteArtifactPlan(
			{
				exposes: { './BillingArea': { component: './src/BillingArea.tsx' } },
				remotes: {},
				providedPackages: ['@company/design-system']
			},
			{ packageName: '@company/billing', buildKey }
		);
		const onEntries = vi.fn();
		const adapter = createExactRemoteRollupAdapter({
			plan,
			applicationRoot: '/workspace/billing',
			registrationModules: {
				'./BillingArea': 'export const exactHydrationRegistration = { islands: {} };'
			},
			onEntries
		});
		const emitFile = vi.fn(() => 'reference');
		expect(adapter.pageBootstrapImport).toBe('virtual:exact-provided-packages');
		expect(adapter.developmentEntries).toEqual({
			'./BillingArea': '/@id/virtual:exact-remote-entry/Li9CaWxsaW5nQXJlYQ'
		});
		expect(await adapter.resolveId('virtual:exact-remote-entry/Li9CaWxsaW5nQXJlYQ')).toBe(
			plan.exposures[0]!.entryId
		);
		expect(await adapter.resolveId(adapter.pageBootstrapImport)).toBe('\0exact:provided/bootstrap');
		expect(adapter.load('\0exact:provided/bootstrap')).toContain('getExactProvidedPackageRegistry');
		expect(await adapter.resolveId('@exactjs/core', '\0exact:provided/bootstrap')).toBeNull();
		adapter.buildStart({ emitFile });
		expect(emitFile).toHaveBeenCalledWith({
			type: 'chunk',
			id: plan.exposures[0]!.entryId,
			name: 'exact-remote-BillingArea',
			preserveSignature: 'strict'
		});

		const importer = '/workspace/billing/src/BillingArea.tsx?exact-remote-scope=billing';
		adapter.recordModule(
			'import Design, { Button as Primary } from "@company/design-system"; Primary; Design;',
			importer
		);
		const bridge = (await adapter.resolveId('@company/design-system', importer))! as string;
		expect(adapter.load(bridge)).toContain('export { __exactDefault as default }');
		expect(adapter.load(bridge)).toContain('as Button');
		expect(adapter.load(plan.exposures[0]!.componentFacadeId)).toContain(
			`${path.basename(path.resolve('/workspace/billing/src/BillingArea.tsx'))}?exact-remote-scope=`
		);
		expect(adapter.load(plan.exposures[0]!.registrationId)).toContain('exactHydrationRegistration');

		adapter.generateBundle({
			'assets/billing.js': {
				type: 'chunk',
				fileName: 'assets/billing.js',
				facadeModuleId: plan.exposures[0]!.entryId,
				isEntry: true
			}
		});
		expect(onEntries).toHaveBeenCalledWith({ './BillingArea': 'assets/billing.js' });
	});

	it('supports statically used namespace exports and rejects opaque or dynamic access', async () => {
		const plan = createExactRemoteArtifactPlan(
			{
				exposes: { './Area': { component: './Area.ts' } },
				remotes: {},
				providedPackages: ['@company/contexts']
			},
			{ packageName: '@company/app', buildKey }
		);
		const adapter = createExactRemoteRollupAdapter({
			plan,
			applicationRoot: '/workspace/app',
			registrationModules: { './Area': 'export const exactHydrationRegistration = {};' }
		});
		const importer = '/workspace/app/Area.ts?exact-remote-scope=area';
		adapter.recordModule(
			'import * as Contexts from "@company/contexts"; Contexts.AccountContext;',
			importer
		);
		const bridge = (await adapter.resolveId('@company/contexts', importer))! as string;
		expect(adapter.load(bridge)).toContain('as AccountContext');
		expect(() =>
			adapter.recordModule(
				'import * as Contexts from "@company/contexts"; consume(Contexts);',
				'/workspace/app/opaque.ts?exact-remote-scope=area'
			)
		).toThrow('must use static property access');
		expect(() =>
			adapter.recordModule(
				'import("@company/contexts");',
				'/workspace/app/dynamic.ts?exact-remote-scope=area'
			)
		).toThrow('Dynamic imports');
	});

	it('preserves an empty named import as package evaluation', async () => {
		const plan = createExactRemoteArtifactPlan(
			{
				exposes: { './Area': { component: './Area.js' } },
				remotes: {},
				providedPackages: ['@company/runtime']
			},
			{ packageName: '@company/app', buildKey }
		);
		const adapter = createExactRemoteRollupAdapter({
			plan,
			applicationRoot: '/workspace/app',
			registrationModules: { './Area': 'export const exactHydrationRegistration = {};' }
		});
		const importer = '/workspace/app/Area.js?exact-remote-scope=area';
		adapter.recordModule('import {} from "@company/runtime";', importer);

		const bridge = (await adapter.resolveId('@company/runtime', importer))! as string;
		expect(adapter.load(bridge)).toContain('require("@company/runtime")');
	});
});
