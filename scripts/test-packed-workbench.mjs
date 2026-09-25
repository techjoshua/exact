import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { needsPackedWorkbench } from './packed-workbench-selection.mjs';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPackedAppInstaller } from './packed-app-dependencies.mjs';
import { parseNpmPackOutput } from './npm-pack-output.mjs';
import { runAcceptanceCommand, withAcceptanceServer } from './acceptance-process.mjs';
import { checkPackedWorkbench } from './packed-workbench-journey.mjs';

const workspace = path.resolve(import.meta.dirname, '..');
if (process.argv[2] === '--if-affected') {
	assert.equal(process.argv.length, 5, 'Expected --if-affected BASE HEAD');
	const paths = execFileSync(
		'git',
		['diff', '--name-only', '-z', process.argv[3], process.argv[4], '--'],
		{ cwd: workspace, encoding: 'utf8' }
	)
		.split('\0')
		.filter(Boolean);
	if (!needsPackedWorkbench(paths)) {
		console.log('Packed workbench skipped: no affected framework or acceptance files.');
		process.exit(0);
	}
} else assert.equal(process.argv.length, 2, 'Unknown packed workbench arguments');
const source = path.join(import.meta.dirname, 'test-support/packed-workbench');
const evidence = path.join(workspace, '.tmp/packed-workbench-failures');
await rm(evidence, { recursive: true, force: true });
const temporary = await mkdtemp(path.join(tmpdir(), 'exact-packed-workbench-'));
const framework = Object.fromEntries(
	['core', 'dom', 'ssr', 'jsx', 'reactive', 'component-library'].map((name) => [
		`@exactjs/${name}`,
		'^0.6.0'
	])
);
let browser;
try {
	const install = await createPackedAppInstaller(workspace, temporary);
	const builder = path.join(temporary, 'builder');
	await mkdir(builder);
	await json(path.join(builder, 'package.json'), {
		name: 'acceptance-builder',
		private: true,
		type: 'module',
		dependencies: {
			...framework,
			'@exactjs/compiler': '^0.6.0',
			'@exactjs/create-exact-app': '^0.6.0',
			typescript: 'npm:@typescript/typescript6@^6.0.2'
		}
	});
	await install(builder);
	const { createExactApp } = await import(
		pathToFileURL(path.join(builder, 'node_modules/@exactjs/create-exact-app/dist/index.js'))
	);
	const tone = await library(builder, 'tone', ['tone']);
	await runAcceptanceCommand(
		[process.env.npm_execpath, 'install', '--no-audit', '--no-fund', tone],
		builder
	);
	const controls = await library(builder, 'controls', ['Control', 'Row'], {
		'@acceptance/tone': `file:${tone}`
	});
	const { chromium } = await import('playwright');
	browser = await chromium.launch();
	for (const runtime of ['browser', 'node']) {
		const root = path.join(temporary, runtime);
		await createExactApp({
			directory: root,
			name: `packed-${runtime}`,
			bundler: 'vite',
			runtime,
			...(runtime === 'browser' ? { output: 'single-file' } : {}),
			testRunner: 'none',
			skill: false
		});
		const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
		manifest.dependencies['@acceptance/controls'] = `file:${controls}`;
		Object.assign(manifest.dependencies, framework);
		await json(path.join(root, 'package.json'), manifest);
		await install(root);
		for (const name of [
			'@acceptance/controls',
			'@acceptance/tone',
			'@exactjs/core',
			'@exactjs/compiler'
		]) {
			const resolved = await realpath(path.join(root, 'node_modules', name));
			assert.ok(resolved.startsWith(root + path.sep), `${name} escaped the isolated installation`);
		}
		await cp(path.join(source, 'App.tsx'), path.join(root, 'src/App.tsx'));
		for (const enabled of [true, false]) {
			// Remove only the optional provider, retaining the installed native compiler.
			if (!enabled) await rm(path.join(root, 'node_modules/@acceptance/tone'), { recursive: true });
			await writeFile(
				path.join(root, 'exact.config.mjs'),
				"export default { componentLibraries: { allow: ['@acceptance/tone'] } };\n"
			);
			await runAcceptanceCommand(
				runtime === 'node'
					? ['scripts/build.mjs']
					: [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'],
				root
			);
			const name = `${runtime}-${enabled ? 'enabled' : 'disabled'}`;
			const check = (url) =>
				checkPackedWorkbench(browser, url, {
					name,
					enabled,
					ssr: runtime === 'node',
					evidence
				});
			if (runtime === 'node') await withAcceptanceServer(root, check);
			else await check(pathToFileURL(path.join(root, 'dist/index.html')).href);
		}
	}
	console.log('Packed workbench acceptance passed (four production configurations).');
} finally {
	try {
		await browser?.close();
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}

/** Creates and packs a separately compiled provider; consumers receive only target artifacts. */
async function library(builder, name, exports, optionalDependencies = {}) {
	const root = path.join(builder, name);
	await mkdir(path.join(root, 'src'), { recursive: true });
	await cp(path.join(source, `${name}.tsx`), path.join(root, 'src/index.tsx'));
	await writeFile(
		path.join(root, 'src/jsx.d.ts'),
		"import type { JSX } from '@exactjs/jsx/jsx-runtime'; declare global { const _target: (props: JSX.IntrinsicElements['_target']) => JSX.Element; }\n"
	);
	await json(path.join(root, 'tsconfig.json'), {
		compilerOptions: {
			target: 'ES2022',
			declaration: true,
			emitDeclarationOnly: true,
			outDir: 'dist',
			rootDir: 'src',
			module: 'ESNext',
			moduleResolution: 'Bundler',
			jsx: 'react-jsx',
			jsxImportSource: '@exactjs/jsx',
			strict: true,
			skipLibCheck: true
		},
		include: ['src']
	});
	await json(path.join(root, 'package.json'), {
		name: `@acceptance/${name}`,
		version: '0.1.0',
		private: true,
		type: 'module',
		files: ['dist', 'capability.d.ts'],
		exports: {
			'.': {
				types: name === 'tone' ? './capability.d.ts' : './dist/index.d.ts',
				browser: './dist/client/index.js',
				default: './dist/server/index.js'
			}
		},
		exactCompiledComponents: exports,
		exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' },
		dependencies: framework,
		optionalDependencies
	});
	if (name === 'tone')
		await writeFile(
			path.join(root, 'capability.d.ts'),
			`export { tone } from './dist/index.js' with { type: 'exact-enhancement' };\n`
		);
	await runAcceptanceCommand(
		[path.join(builder, 'node_modules/@exactjs/compiler/dist/cli.js'), 'build-library'],
		root
	);
	const { stdout } = await runAcceptanceCommand(
		[
			process.env.npm_execpath,
			'pack',
			'--json',
			'--ignore-scripts',
			'--pack-destination',
			temporary
		],
		root
	);
	const packed = parseNpmPackOutput(stdout, `@acceptance/${name}`);
	assert.equal(path.basename(packed.filename), packed.filename);
	return path.join(temporary, packed.filename);
}

/** Writes deterministic fixture manifests without shell interpolation. */
async function json(filename, value) {
	await writeFile(filename, JSON.stringify(value, null, 2) + '\n');
}
