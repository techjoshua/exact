import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { it, expect, onTestFinished } from 'vitest';
import { exact } from './index.js';
import { createInstalledThemeFixture } from '../../test-support/installed-theme.js';
it('loads installed library enhancements in development without authored SSR inlining', async () => {
	const fixture = await createInstalledThemeFixture('library');
	onTestFinished(fixture.dispose);
	const vite = await createServer({
		root: fixture.root,
		configFile: false,
		appType: 'custom',
		logLevel: 'silent',
		plugins: [exact({ serverComponents: true, reactCompatibility: false })],
		server: { middlewareMode: true }
	});
	try {
		const module = await vite.ssrLoadModule('/entry.tsx');
		const result = await module.render();
		expect(result.html).toContain('exact-theme-field');
		expect(result.html).toContain('data-exact-theme=');
	} finally {
		await vite.close();
	}
}, 30000);

it('keeps discovered libraries subject to component authorization policy', async () => {
	const fixture = await createInstalledThemeFixture('library');
	onTestFinished(fixture.dispose);
	await writeFile(
		path.join(fixture.root, 'exact.config.mjs'),
		"export default {componentLibraries:{deny:['@fixture/page']}};"
	);
	const vite = await createServer({
		root: fixture.root,
		configFile: false,
		appType: 'custom',
		logLevel: 'silent',
		plugins: [exact({ serverComponents: true, reactCompatibility: false })],
		server: { middlewareMode: true }
	});
	try {
		await expect(vite.ssrLoadModule('/entry.tsx')).rejects.toThrow('matches deny rule');
	} finally {
		await vite.close();
	}
}, 30_000);
