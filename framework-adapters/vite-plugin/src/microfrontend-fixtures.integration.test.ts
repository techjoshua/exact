import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { build, type Plugin } from 'vite';
import { exact } from './plugin.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const fixtureRoot = path.join(repositoryRoot, 'fixtures', 'microfrontends');
const temporaryRoots: string[] = [];

describe('microfrontend fixture applications', () => {
	afterEach(async () => {
		await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
	});

	it('builds the page, billing, and branding applications independently', async () => {
		const outputRoot = await mkdtemp(path.join(tmpdir(), 'exact-microfrontend-fixtures-'));
		temporaryRoots.push(outputRoot);
		const previousBuildKey = process.env.EXACT_BUILD_KEY;
		process.env.EXACT_BUILD_KEY = buildKey;
		try {
			const page = await buildFixture('page-host', outputRoot);
			const billing = await buildFixture('billing-host', outputRoot);
			const branding = await buildFixture('branding-host', outputRoot);

			expect(page.entries).toEqual({});
			expect(billing.entries['./Billing']).toMatch(/exact-remote-Billing.*\.js$/i);
			expect(branding.entries['./Shell']).toMatch(/exact-remote-Shell.*\.js$/i);

			const pageProgram = await combinedJavaScript(page.outDir);
			expect(pageProgram).toContain('https://cdn.example.test/billing/');
			expect(pageProgram).toContain('https://cdn.example.test/branding/');
			expect(pageProgram).not.toContain('billing.internal');
			expect(pageProgram).not.toContain('branding.internal');
			expect(pageProgram.indexOf('@exact/provided-packages')).toBeLessThan(
				pageProgram.indexOf('fixture-theme')
			);

			const billingFiles = await recursiveFiles(billing.outDir);
			expect(billingFiles.some((file) => /details.*\.js$/i.test(file))).toBe(true);
			expect(billingFiles.some((file) => file.endsWith('.css'))).toBe(true);
			expect(billingFiles.some((file) => file.endsWith('.woff2'))).toBe(true);
			expect(billingFiles.some((file) => file.endsWith('.svg'))).toBe(true);

			for (const remote of [billing, branding]) {
				const program = await combinedJavaScript(remote.outDir);
				expect(program).toContain('@exact/provided-packages');
				expect(program).toContain(buildKey);
				expect(program).not.toContain('billing.internal');
				expect(program).not.toContain('branding.internal');
			}
		} finally {
			if (previousBuildKey === undefined) delete process.env.EXACT_BUILD_KEY;
			else process.env.EXACT_BUILD_KEY = previousBuildKey;
		}
	}, 60_000);
});

async function buildFixture(name: string, outputRoot: string) {
	const root = path.join(fixtureRoot, name);
	const outDir = path.join(outputRoot, name);
	let entries: Readonly<Record<string, string>> = {};
	await build({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [
			exact({
				applicationRoot: root,
				onRemoteEntries(value) {
					entries = value;
				}
			}) as unknown as Plugin
		],
		build: { outDir, emptyOutDir: true, assetsInlineLimit: 0, minify: false }
	});
	return { entries, outDir };
}

async function combinedJavaScript(root: string): Promise<string> {
	return (
		await Promise.all(
			(await recursiveFiles(root))
				.filter((file) => file.endsWith('.js'))
				.map((file) => readFile(path.join(root, file), 'utf8'))
		)
	).join('\n');
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
