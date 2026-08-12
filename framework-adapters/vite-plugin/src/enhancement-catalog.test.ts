import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exactEnhancementFacadeRequest } from '@exactjs/compiler/adapter-support';
import {
	ExactViteEnhancementFacadeCatalog,
	exactEnhancementFacades,
	prependViteEnhancementRegistrations
} from './enhancement-catalog.js';
import { exact as createExact } from './plugin.js';

const exact = (...args: Parameters<typeof createExact>) =>
	createExact(...args) as Omit<ReturnType<typeof createExact>, 'transform'> & {
		transform(
			...values: Parameters<ReturnType<typeof createExact>['transform']>
		): Awaited<ReturnType<ReturnType<typeof createExact>['transform']>>;
	};

describe('Vite enhancement catalog emission', () => {
	it('registers only the capabilities emitted for a compiled application module', () => {
		const code = prependViteEnhancementRegistrations('export const view = 1;', [
			{
				identity: '@exactjs/motion#default',
				moduleSpecifier: '@exactjs/motion',
				exportName: 'default'
			},
			{
				identity: '@acme/input#gesture',
				moduleSpecifier: '@acme/input/enhancements',
				exportName: 'gesture'
			}
		]);

		expect(code.match(/exact:optional-enhancement\//g)).toHaveLength(2);
		expect(code).toContain(`__exactRegisterEnhancement("@exactjs/motion#default"`);
		expect(code).toContain('@exactjs/core/framework/enhancement-catalog');
		expect(code).not.toContain('pluginRegistry');
	});

	it('keeps client renderer roots lean and redirects server roots to catalog facades', async () => {
		const client = exact({ reactCompatibility: false });
		const server = exact({ reactCompatibility: false, target: 'server' });

		for (const [request, facade] of Object.entries(exactEnhancementFacades)) {
			expect(await client.resolveId!(request)).toBeNull();
			expect(await server.resolveId!(request)).toBe(facade);
		}
	});

	it('links compiler-emitted capability metadata without preparing a compiler registry', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-vite-capability-'));
		const entry = path.join(root, 'entry.tsx');
		const source = `
			import motion from './motion.js' with { type: 'exact-enhancement' };
			export const view = <article motion:preset="fade" />;
		`;
		writeFileSync(
			path.join(root, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					module: 'nodenext',
					moduleResolution: 'nodenext',
					target: 'es2022',
					jsx: 'preserve'
				},
				include: ['*.ts', '*.tsx']
			})
		);
		writeFileSync(
			path.join(root, 'motion.ts'),
			`export { default } from './motion-implementation.js' with { type: 'exact-enhancement' };`
		);
		writeFileSync(
			path.join(root, 'motion-implementation.ts'),
			`export default function Motion(props: { preset?: string; children?: unknown }) { return props.children; }`
		);
		writeFileSync(entry, source);
		const plugin = exact({ applicationRoot: root, reactCompatibility: false });

		try {
			const result = plugin.transform(source, entry);
			expect(result?.code).toContain(`exact:optional-enhancement/`);
			expect(result?.code).toContain(`__exactRegisterEnhancement("./motion.js#default"`);
			expect(result?.code).toContain('@exactjs/core/framework/enhancement-catalog');
		} finally {
			plugin.closeBundle?.();
		}
	});

	it('loads pass-through and provider facades without retaining stale generations', async () => {
		const catalog = new ExactViteEnhancementFacadeCatalog();
		const request = exactEnhancementFacadeRequest({
			identity: '@acme/motion#default',
			moduleSpecifier: '@acme/motion',
			exportName: 'default'
		});
		const absent = await catalog.resolve(
			request,
			'/app/view.tsx',
			async () => null,
			async (id) => id,
			'@exactjs/dom/framework/enhancements'
		);
		expect(catalog.load(absent!)).toContain('exactEnhancementPassThrough');
		expect(catalog.load(absent!)).toContain('@exactjs/dom/framework/enhancements');
		const available = await catalog.resolve(
			request,
			'/app/view.tsx',
			async () => '/packages/motion.js',
			async (id) => id,
			'@exactjs/dom/framework/enhancements'
		);
		expect(catalog.load(available!)).toContain('from "/packages/motion.js"');
		expect(catalog.load(available!)).toContain('@exactjs/dom/framework/enhancements');
		catalog.advanceGeneration();
		expect(catalog.load(available!)).toBeUndefined();
	});
});
