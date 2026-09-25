import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { satisfies } from 'semver';
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
	// CI installs Chromium for the checkout's locked Playwright version. A fresh npm
	// install must not select a newer runner that requires a different browser revision.
	const playwrightVersion = createRequire(import.meta.url)('playwright/package.json').version;
	const manifestFile = path.join(root, 'package.json');
	const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
	assert.ok(satisfies(playwrightVersion, manifest.devDependencies['@playwright/test']));
	manifest.devDependencies['@playwright/test'] = playwrightVersion;
	await writeFile(manifestFile, JSON.stringify(manifest));
	const install = await createPackedAppInstaller(workspace, temporary);
	await install(root);
	assert.equal(
		JSON.parse(
			await readFile(path.join(root, 'node_modules/@playwright/test/package.json'), 'utf8')
		).version,
		playwrightVersion
	);
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
	const hostStarted = performance.now();
	await withAcceptanceServer(
		root,
		async (url) => {
			console.log(
				`Packed shipping host ready after ${Math.round(performance.now() - hostStarted)}ms`
			);
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
