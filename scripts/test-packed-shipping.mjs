import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createPackedAppInstaller } from './packed-app-dependencies.mjs';
import { runAcceptanceCommand, withAcceptanceServer } from './acceptance-process.mjs';

const workspace = path.resolve(import.meta.dirname, '..');
const source = path.join(workspace, 'apps/shipping-calculator');
const temporary = await mkdtemp(path.join(tmpdir(), 'exact-packed-shipping-'));
try {
	const root = path.join(temporary, 'app');
	const evidence = path.join(workspace, '.tmp/packed-shipping-failures');
	await rm(evidence, { recursive: true, force: true });
	// Copy authored inputs only. Never copy credentials, generated artifacts, or workspace links.
	for (const name of [
		'src',
		'scripts',
		'e2e',
		'public',
		'package.json',
		'exact.config.ts',
		'vite.config.ts',
		'vite.server.config.ts',
		'playwright.config.ts'
	])
		await cp(path.join(source, name), path.join(root, name), { recursive: true });
	const base = JSON.parse(await readFile(path.join(workspace, 'tsconfig.base.json'), 'utf8'));
	const app = JSON.parse(await readFile(path.join(source, 'tsconfig.json'), 'utf8'));
	await writeFile(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: { ...base.compilerOptions, ...app.compilerOptions },
			include: ['src', '.exact/**/*']
		})
	);
	const install = await createPackedAppInstaller(workspace, temporary);
	await install(root);
	for (const name of ['compiler', 'core', 'hydrate', 'server', 'ssr', 'vite-plugin'])
		assert.ok(
			(await realpath(path.join(root, 'node_modules/@exactjs', name))).startsWith(root + path.sep)
		);
	const environment = Object.fromEntries(
		Object.entries(process.env).filter(([name]) => !/^(?:USPS|UPS|FEDEX|DHL)_/.test(name))
	);
	environment.SHIPPING_PROVIDERS = 'doop';
	delete environment.EXACT_COMPILER_EXECUTABLE;
	delete environment.NODE_PATH;
	await runAcceptanceCommand(['scripts/generate-artifacts.mjs'], root, environment);
	for (const config of ['vite.config.ts', 'vite.server.config.ts'])
		await runAcceptanceCommand(
			['node_modules/vite/bin/vite.js', 'build', '--config', config],
			root,
			environment
		);
	await runAcceptanceCommand(['scripts/compress-client-assets.mjs'], root, environment);
	await withAcceptanceServer(
		root,
		async (url) => {
			const result = await runAcceptanceCommand(
				['node_modules/@playwright/test/cli.js', 'test'],
				root,
				{
					...environment,
					EXACT_SHIPPING_ACCEPTANCE_URL: url,
					EXACT_SHIPPING_EVIDENCE: evidence
				}
			);
			console.log(result.stdout);
		},
		{ entry: 'dist/server/start.js', environment }
	);
	console.log('Packed shipping continuation acceptance passed.');
} finally {
	await rm(temporary, { recursive: true, force: true });
}
