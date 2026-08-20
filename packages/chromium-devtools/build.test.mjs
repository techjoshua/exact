import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import './build.mjs';

const executableEntries = [
	'page-bridge.js',
	'content-script.js',
	'background.js',
	'devtools.js',
	'panel.js'
];

const bareModuleSpecifier =
	/\b(?:from\s*|import\s*(?:\(\s*)?)['"](?![./]|(?:chrome|data|https?):)[^'"]+['"]/;

describe('Chromium extension build', () => {
	it.each(['page-bridge.js', 'content-script.js'])(
		'emits %s as a classic manifest content script',
		async (filename) => {
			const output = await readFile(new URL(`./dist/${filename}`, import.meta.url), 'utf8');

			expect(output).not.toMatch(/^\s*(?:import|export)\b/m);
			expect(output).toMatch(/\(\(\) => \{\r?\n/);
		}
	);

	it.each(['background.js', 'devtools.js', 'panel.js'])(
		'bundles package dependencies into %s',
		async (filename) => {
			const output = await readFile(new URL(`./dist/${filename}`, import.meta.url), 'utf8');

			expect(output).not.toMatch(bareModuleSpecifier);
		}
	);

	it('keeps TypeScript compiler output outside the loadable extension directory', async () => {
		const config = JSON.parse(await readFile(new URL('./tsconfig.json', import.meta.url), 'utf8'));

		expect(config.compilerOptions.outDir).not.toBe('dist');
	});

	it('leaves every manifest-owned executable free of bare module specifiers', async () => {
		for (const filename of executableEntries) {
			const output = await readFile(new URL(`./dist/${filename}`, import.meta.url), 'utf8');
			expect(output, filename).not.toMatch(bareModuleSpecifier);
		}
	});
});
