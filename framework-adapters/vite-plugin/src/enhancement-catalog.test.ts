import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createViteDomEnhancementFacade } from './enhancement-catalog.js';
import { exact } from './plugin.js';

describe('Vite enhancement catalog emission', () => {
	it('imports only trusted prepared entries and preserves an explicit renderer catalog', () => {
		const code = createViteDomEnhancementFacade(
			new Map([
				[
					'@exactjs/motion#default',
					{
						identity: '@exactjs/motion#default',
						packageName: '@exactjs/motion',
						subpath: '.',
						exportName: 'default'
					}
				],
				[
					'@acme/input/enhancements#gesture',
					{
						identity: '@acme/input/enhancements#gesture',
						packageName: '@acme/input',
						subpath: './enhancements',
						exportName: 'gesture'
					}
				]
			])
		);

		expect(code).toContain(`from "@exactjs/motion"`);
		expect(code).toContain(`from "@acme/input/enhancements"`);
		expect(code).toContain(`options?.enhancementCatalog`);
		expect(code).toContain(`enhancementCatalog: __exactEnhancementCatalog`);
		expect(code).not.toContain('pluginDiscovery');
	});

	it('routes DOM imports through a facade built from the final trusted package set', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-vite-enhancements-'));
		writeJson(path.join(root, 'package.json'), {
			name: '@app/root',
			version: '1.0.0',
			dependencies: { '@acme/enhancement': '1.0.0' }
		});
		const pluginRoot = path.join(root, 'node_modules', '@acme', 'enhancement');
		mkdirSync(pluginRoot, { recursive: true });
		writeJson(path.join(pluginRoot, 'package.json'), {
			name: '@acme/enhancement',
			version: '1.0.0',
			type: 'module',
			dependencies: { '@exactjs/plugin-api': '^0.1.0' },
			exports: { '.': { types: './capability.d.ts', default: './index.js' } },
			exact: {
				plugin: {
					schemaVersion: 1,
					protocolVersion: '1.0.0',
					configKey: 'enhancement',
					entries: {}
				}
			}
		});
		writeFileSync(
			path.join(pluginRoot, 'capability.d.ts'),
			`export { default } from './component.js' with { type: 'exact-plugin' };`
		);
		writeFileSync(
			path.join(pluginRoot, 'component.d.ts'),
			'export default function Enhancement(props: { children?: unknown }): unknown;'
		);
		writeFileSync(path.join(pluginRoot, 'index.js'), 'export default function Enhancement() {}');

		const vitePlugin = exact({ applicationRoot: root, reactCompatibility: false });
		await vitePlugin.buildStart?.call({ addWatchFile() {} });
		try {
			expect(
				await vitePlugin.resolveId?.('@exactjs/dom', path.join(root, 'src/main.ts'))
			).toBe('\0virtual:exact/enhancement-dom');
			const loaded = vitePlugin.load?.('\0virtual:exact/enhancement-dom') as
				| { code?: string }
				| undefined;
			expect(loaded?.code).toContain(`from "@acme/enhancement"`);
			expect(loaded?.code).toContain('@acme/enhancement#default');
		} finally {
			vitePlugin.closeBundle?.();
		}
	});
});

function writeJson(filename: string, value: unknown): void {
	writeFileSync(filename, JSON.stringify(value));
}
