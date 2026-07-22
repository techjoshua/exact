import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { build, type Plugin } from 'vite';
import { exact } from './plugin.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const temporaryRoots: string[] = [];

describe('@exact/vite-plugin: microfrontend integration', () => {
	afterEach(async () => {
		await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
	});

	it('discovers the framework plugin, emits exposures, and publishes packages before the page entry', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-vite-microfrontends-'));
		temporaryRoots.push(root);
		await mkdir(path.join(root, 'src'));
		await linkExactPackages(root);
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({
				name: '@company/page-and-remote',
				version: '1.0.0',
				type: 'module',
				dependencies: { '@exact/microfrontends': '0.0.0' }
			})
		);
		await writeFile(
			path.join(root, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: { jsx: 'preserve', target: 'ES2022', module: 'ESNext' },
				include: ['src']
			})
		);
		await writeFile(
			path.join(root, 'exact.config.mjs'),
			`export default {
	plugins: {
		microfrontends(config) {
			config.exposes['./Area'] = { component: './src/Area.tsx' };
			config.remotes.billing = {
				endpoint: 'http://billing.internal/__exact',
				clientEntry: 'https://cdn.example.test/billing.js'
			};
		}
	}
};
`
		);
		await writeFile(
			path.join(root, 'index.html'),
			`<!doctype html><html><body><main id="app"></main><script type="module" src="/src/page.ts"></script></body></html>`
		);
		await writeFile(path.join(root, 'src', 'page.ts'), `globalThis.__pageLoaded = true;\n`);
		await writeFile(
			path.join(root, 'src', 'Area.tsx'),
			`export default function Area() { return () => <section>remote area</section>; }\n`
		);

		const previousBuildKey = process.env.EXACT_BUILD_KEY;
		let emittedEntries: Readonly<Record<string, string>> | undefined;
		let developmentEntries: Readonly<Record<string, string>> | undefined;
		process.env.EXACT_BUILD_KEY = buildKey;
		try {
			await build({
				root,
				logLevel: 'silent',
				plugins: [
					exact({
						applicationRoot: root,
						onRemoteEntries(entries) {
							emittedEntries = entries;
						},
						onRemoteDevelopmentEntries(entries) {
							developmentEntries = entries;
						}
					}) as unknown as Plugin
				],
				build: { outDir: 'dist', assetsInlineLimit: 0 }
			});
		} finally {
			if (previousBuildKey === undefined) delete process.env.EXACT_BUILD_KEY;
			else process.env.EXACT_BUILD_KEY = previousBuildKey;
		}

		const files = await recursiveFiles(path.join(root, 'dist'));
		expect(files.some((file) => /exact-remote-Area.*\.js$/i.test(file))).toBe(true);
		expect(emittedEntries?.['./Area']).toMatch(/exact-remote-Area.*\.js$/i);
		expect(developmentEntries).toEqual({
			'./Area': '/@id/virtual:exact-remote-entry/Li9BcmVh'
		});
		const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
		expect(html, html).not.toContain('virtual:exact-provided-packages');
		const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/gi)].map((match) => match[1]!);
		expect(scripts.length).toBeGreaterThanOrEqual(1);
		const javascript = await Promise.all(
			scripts.map((source) => readFile(path.join(root, 'dist', source.replace(/^\//, '')), 'utf8'))
		);
		const pageProgram = javascript.join('\n');
		expect(pageProgram).toContain('@exact/provided-packages');
		expect(pageProgram).toContain('__pageLoaded');
		expect(pageProgram).toContain('https://cdn.example.test/billing.js');
		expect(pageProgram).not.toContain('billing.internal');
		expect(pageProgram.indexOf('@exact/provided-packages')).toBeLessThan(
			pageProgram.indexOf('__pageLoaded')
		);
	});
});

async function linkExactPackages(root: string): Promise<void> {
	const scope = path.join(root, 'node_modules', '@exact');
	await mkdir(scope, { recursive: true });
	for (const [name, relative] of [
		['microfrontends', 'plugins/microfrontends'],
		['core', 'packages/core'],
		['dom', 'packages/dom'],
		['hydrate', 'packages/hydrate'],
		['reactive', 'packages/reactive'],
		['jsx', 'packages/jsx-runtime']
	] as const)
		await symlink(path.join(repositoryRoot, relative), path.join(scope, name), 'junction');
}

async function recursiveFiles(root: string, relative = ''): Promise<string[]> {
	const files: string[] = [];
	for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
		const next = path.join(relative, entry.name);
		if (entry.isDirectory()) files.push(...(await recursiveFiles(root, next)));
		else files.push(next);
	}
	return files;
}
