import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	materializeWebpackEnhancementFacades,
	webpackEnhancementFacadeProvenance
} from './enhancement-facades.js';
import { exactEnhancementFacadeRequest } from '@exactjs/compiler/adapter-support';

describe('Webpack physical enhancement facades', () => {
	it('materializes available and absent providers as ordinary ESM files', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-webpack-enhancement-'));
		const importer = path.join(root, 'src', 'view.tsx');
		const providerRoot = path.join(root, 'node_modules', '@acme', 'motion');
		mkdirSync(path.dirname(importer), { recursive: true });
		mkdirSync(providerRoot, { recursive: true });
		writeFileSync(importer, 'export {};');
		writeFileSync(
			path.join(providerRoot, 'package.json'),
			JSON.stringify({ name: '@acme/motion', type: 'module', exports: './index.js' })
		);
		writeFileSync(path.join(providerRoot, 'index.js'), 'export default "motion";\n');
		const available = {
			identity: '@acme/motion#default',
			moduleSpecifier: '@acme/motion',
			exportName: 'default'
		};
		const absent = {
			identity: '@acme/absent#default',
			moduleSpecifier: '@acme/absent',
			exportName: 'default'
		};
		const code = [available, absent]
			.map((entry) => `import value from ${JSON.stringify(exactEnhancementFacadeRequest(entry))};`)
			.join('\n');
		const materialized = materializeWebpackEnhancementFacades(
			code,
			[available, absent],
			importer,
			root,
			'server'
		);
		const files = [...materialized.matchAll(/from "([^"]+\.mjs)"/g)].map((match) => match[1]!);
		expect(files).toHaveLength(2);
		expect(await import(pathToFileURL(files[0]!).href)).toMatchObject({ default: 'motion' });
		expect(readFileSync(files[1]!, 'utf8')).toContain('exactEnhancementPassThrough');
		expect(webpackEnhancementFacadeProvenance(files[0])).toEqual({
			importer: path.resolve(importer),
			request: '@acme/motion'
		});
	});
});
