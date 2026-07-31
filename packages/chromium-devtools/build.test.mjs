import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import './build.mjs';

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

			expect(output).not.toMatch(/\b(?:from|import)\s*(?:\(\s*)?["']@exactjs\//);
		}
	);
});
