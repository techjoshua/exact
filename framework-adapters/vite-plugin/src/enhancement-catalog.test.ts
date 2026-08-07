import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	exactEnhancementFacades,
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
		expect(code).toContain('@exactjs/core/framework/enhancement-catalog');
		expect(code).not.toContain('pluginRegistry');
	});

	it('redirects every renderer root to the shared bundle-catalog facade', () => {
		const plugin = exact({ reactCompatibility: false });

		for (const [request, facade] of Object.entries(exactEnhancementFacades)) {
			expect(plugin.resolveId!(request)).toBe(facade);
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
			expect(result?.code).toContain(`from "./motion.js"`);
			expect(result?.code).toContain(`__exactRegisterEnhancement("./motion.js#default"`);
			expect(result?.code).toContain('@exactjs/core/framework/enhancement-catalog');
		} finally {
			plugin.closeBundle?.();
		}
	});
});
