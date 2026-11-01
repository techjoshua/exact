import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';
import { verifyLibrarySelectionExecution } from './library-selection-evidence-journey.js';

/**
 * Selects inspected unknown library artifacts, then verifies policy denial warns at build and
 * rejects execution before the denied implementation evaluates.
 */
export async function verifyLibrarySelectionEvidenceContract(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
): Promise<void> {
	const workspace = fileURLToPath(new URL('../../', import.meta.url));
	const packageRoot = process.env.EXACT_DIAGNOSTIC_PACKAGE_ROOT ?? workspace;
	const tools = createRequire(path.join(packageRoot, 'package.json'));
	const dependencies = Object.fromEntries(
		await Promise.all(
			['component-library', 'core', 'dom'].map(async (packageName) => {
				const name = `@exactjs/${packageName}`;
				const manifest = JSON.parse(
					await readFile(path.join(packageRoot, 'node_modules', name, 'package.json'), 'utf8')
				);
				assert.equal(manifest.name, name);
				assert.equal(typeof manifest.version, 'string');
				return [name, manifest.version];
			})
		)
	);
	const producer = path.join(root, 'node_modules/@fixture/selection-evidence');
	await mkdir(path.join(producer, 'src'), { recursive: true });
	await writeFile(
		path.join(producer, 'package.json'),
		JSON.stringify({
			name: '@fixture/selection-evidence',
			version: '1.0.0',
			type: 'module',
			files: ['dist'],
			exports: {
				'.': {
					types: './dist/index.d.ts',
					browser: './dist/client/index.js',
					default: './dist/server/index.js'
				}
			},
			exactCompiledComponents: ['PublicExample'],
			exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' },
			dependencies
		})
	);
	await writeFile(
		path.join(producer, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				module: 'NodeNext',
				moduleResolution: 'NodeNext',
				jsx: 'react-jsx',
				jsxImportSource: '@exactjs/jsx',
				strict: true,
				skipLibCheck: true,
				rootDir: 'src',
				outDir: 'dist',
				declaration: true
			},
			include: ['src']
		})
	);
	await writeFile(
		path.join(producer, 'src/index.ts'),
		"export {Example as PublicExample} from './Example.js';"
	);
	await writeFile(
		path.join(producer, 'src/Example.tsx'),
		"import {Child} from './Child.js';export function Example(props:{read:()=>string}){props.read();return()=> <Child read={props.read}/>;}"
	);
	await writeFile(
		path.join(producer, 'src/Child.tsx'),
		'export function Child(props:{read:()=>string}){props.read();return()=> <p data-library-selection>{props.read()}</p>;}'
	);
	await promisify(execFile)(
		process.versions.bun ? 'node' : process.execPath,
		[tools.resolve('@exactjs/compiler/cli'), 'build-library', '--root', producer],
		{ cwd: root, timeout: 30000 }
	);
	const facts = JSON.parse(
		await readFile(path.join(producer, 'dist/exact-component-build.json'), 'utf8')
	);
	for (const target of ['client', 'server'] as const) {
		const selected = facts.exports.find((record: { target: string }) => record.target === target);
		assert.equal(selected.exportName, 'PublicExample');
		const module = facts.modules.find(
			(entry: { path: string }) => entry.path === selected.componentModule
		);
		assert.ok(
			module.facts.components.some(
				(component: { id: string; placement: string; artifactTargets: string[] }) =>
					component.id === selected.componentId &&
					component.placement === 'unknown' &&
					component.artifactTargets.length === 0
			)
		);
		const edge = module.facts.componentImports.find(
			(entry: { exportName: string }) => entry.exportName === 'Child'
		);
		assert.deepEqual(edge.artifactTargets, []);
		assert.deepEqual(edge.executable, { target, module: `dist/${target}/Child.js` });
		assert.ok(
			facts.modules
				.find((entry: { path: string }) => entry.path === edge.executable.module)
				.facts.components.some(
					(component: { id: string }) => component.id === edge.canonicalComponentId
				)
		);
	}
	// Consumption must use installed artifacts and facts, without producer source being available.
	await rm(path.join(producer, 'src'), { recursive: true });
	await writeFile(
		path.join(root, 'package.json'),
		JSON.stringify({
			name: '@fixture/selection-consumer',
			type: 'module',
			private: true,
			dependencies: { '@fixture/selection-evidence': '1.0.0' }
		})
	);
	const source =
		"import {PublicExample} from '@fixture/selection-evidence';export function Page(){return()=> <PublicExample read={()=>'library-selected'}/>;}export const libraryRoot=()=> <Page/>;";
	await verifyLibrarySelectionExecution(adapter, root, source, packageRoot);
	// As in existing authorization tests, a denied implementation must never be evaluated.
	for (const target of ['client', 'server']) {
		const file = path.join(producer, `dist/${target}/index.js`);
		await writeFile(
			file,
			"throw Error('UNAUTHORIZED_LIBRARY_EVALUATED');\n" + (await readFile(file, 'utf8'))
		);
	}
	await writeFile(
		path.join(root, 'exact.config.mjs'),
		"export default {componentLibraries:{deny:['@fixture/selection-evidence']}};"
	);
	await writeFile(path.join(root, 'entry.tsx'), source);
	const warnings = await buildDiagnosticFixture(
		adapter,
		root,
		'server',
		false,
		true,
		false,
		packageRoot
	);
	assert.match(warnings.join('\n'), /explicitly-denied/);
	const deniedOutput = (await readdir(path.join(root, 'out-server'))).find((name) =>
		/^entry\.(?:js|mjs|cjs)$/.test(name)
	);
	assert.ok(deniedOutput, 'missing denied server output');
	const runtime = adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath;
	await assert.rejects(
		promisify(execFile)(runtime, [path.join(root, 'out-server', deniedOutput)], {
			cwd: root,
			timeout: 30000
		}),
		(error: unknown) => {
			assert.ok(
				error &&
					typeof error === 'object' &&
					'code' in error &&
					typeof error.code === 'number' &&
					error.code !== 0
			);
			assert.match(String(error), /explicitly-denied/);
			assert.match(String(error), /matches deny rule/);
			assert.doesNotMatch(String(error), /UNAUTHORIZED_LIBRARY_EVALUATED/);
			return true;
		}
	);
	if (adapter === 'vite') await verifyDeniedChangedSource(tools, root, source);
}

/** Exercises changed-source preflight in Node so Vitest cannot replace the private package graph. */
async function verifyDeniedChangedSource(
	tools: ReturnType<typeof createRequire>,
	root: string,
	changed: string
): Promise<void> {
	const pluginEntry = tools.resolve('@exactjs/vite-plugin');
	const expected = {
		plugin: pluginEntry,
		compiler: tools.resolve('@exactjs/compiler'),
		policy: tools.resolve('@exactjs/component-library-policy')
	};
	const script = path.join(root, 'selection-changed-source.mjs');
	await writeFile(
		script,
		`
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const expected=${JSON.stringify(expected)};
const require=createRequire(expected.plugin);
assert.equal(require.resolve('@exactjs/vite-plugin'),expected.plugin);
assert.equal(require.resolve('@exactjs/compiler'),expected.compiler);
assert.equal(require.resolve('@exactjs/component-library-policy'),expected.policy);
const policy=await import(pathToFileURL(expected.policy).href);
assert.equal(typeof policy.requiresExactServerComponentSelection,'function');
const {exact}=await import(pathToFileURL(expected.plugin).href);
const root=${JSON.stringify(root)};
const changed=${JSON.stringify(changed)};
const selected=createRequire(path.join(root,'package.json')).resolve('@fixture/selection-evidence');
const plugin=exact({target:'server',applicationRoot:root,reactCompatibility:false});
let failed=false,failure;
try{
 await plugin.buildStart?.call({addWatchFile(){}});
 const before='export function Page(){return()=> <p>before</p>;}';
 const file=path.join(root,'entry.tsx');
 await writeFile(file,before);
 await plugin.transform(before,file);
 await writeFile(file,changed);
 await assert.rejects(plugin.handleHotUpdate?.call({addWatchFile(){}},{file,read:async()=>changed,
  server:{pluginContainer:{resolveId:async()=>({id:selected})}}}),{code:'explicitly-denied'});
}catch(error){failed=true;failure=error}
finally{try{await plugin.closeBundle?.()}catch(error){if(!failed){failed=true;failure=error}}}
if(failed)throw failure;
console.log(JSON.stringify({hook:'changed-source',verified:true}));
`
	);
	const result = await promisify(execFile)(process.execPath, [script], {
		cwd: root,
		timeout: 30000
	});
	assert.deepEqual(JSON.parse(result.stdout.trim()), { hook: 'changed-source', verified: true });
}
