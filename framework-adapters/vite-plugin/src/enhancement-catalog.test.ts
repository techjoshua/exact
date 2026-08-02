import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	createViteDomEnhancementFacade,
	createViteEnhancementCatalogRuntime,
	createViteHydrateEnhancementFacade,
	createViteSsrEnhancementFacade,
	prependViteEnhancementRegistrations
} from './enhancement-catalog.js';
import { exact } from './plugin.js';

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

		expect(code).toContain(`from "@exactjs/motion"`);
		expect(code).toContain(`from "@acme/input/enhancements"`);
		expect(code).toContain(`__exactRegisterEnhancement("@exactjs/motion#default"`);
		expect(code).not.toContain('pluginRegistry');
	});

	it('shares one bundle-local catalog with the DOM facade without exposing registration', () => {
		const runtime = createViteEnhancementCatalogRuntime();
		const facade = createViteDomEnhancementFacade();

		expect(runtime).toContain('export const exactEnhancementCatalog = new Map()');
		expect(runtime).toContain('Conflicting renderer enhancement implementation');
		expect(facade).toContain(`options?.enhancementCatalog`);
		expect(facade).toContain(`enhancementCatalog: exactEnhancementCatalog`);
		expect(facade).not.toContain('registerExactEnhancement');
	});

	it('supplies the same bundle-local catalog to hydration and server renderers', () => {
		const hydrate = createViteHydrateEnhancementFacade();
		const ssr = createViteSsrEnhancementFacade();

		expect(hydrate).toContain(`from '@exactjs/hydrate'`);
		expect(hydrate).toContain('enhancementCatalog: exactEnhancementCatalog');
		expect(ssr).toContain(`from '@exactjs/ssr'`);
		expect(ssr).toContain('renderToStringAsync(vnode, options)');
		expect(ssr).toContain('renderExactRequestToHtmlResponse(request, server, render, options)');
		expect(ssr).toContain('enhancementCatalog: exactEnhancementCatalog');
		expect(hydrate).not.toContain('registerExactEnhancement');
		expect(ssr).not.toContain('registerExactEnhancement');
	});

	it('links compiler-emitted capability metadata without preparing a plugin registry', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-vite-capability-'));
		const entry = path.join(root, 'entry.tsx');
		const source = `
			import motion from './motion.js' with { type: 'exact-plugin' };
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
			`export { default } from './motion-implementation.js' with { type: 'exact-plugin' };`
		);
		writeFileSync(
			path.join(root, 'motion-implementation.ts'),
			`export default function Motion(props: { preset?: string; children?: unknown }) { return props.children; }`
		);
		writeFileSync(entry, source);
		const plugin = exact({ applicationRoot: root, reactCompatibility: false });

		try {
			const result = plugin.transform(source, entry);
			expect(result?.code).toContain(`from "./motion.js"`);
			expect(result?.code).toContain(`__exactRegisterEnhancement("./motion.js#default"`);
			expect(result?.code).toContain(`virtual:exact/enhancement-catalog`);
		} finally {
			plugin.closeBundle?.();
		}
	});
});
