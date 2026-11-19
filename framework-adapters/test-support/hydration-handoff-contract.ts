import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
	compileProjectArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '@exactjs/compiler';
import { buildLibrary } from '@exactjs/compiler/library-build';
import { copyInstalledRuntimePackages } from './installed-runtime-packages.js';
import {
	assertDiagnosticBuildWarnings,
	buildDiagnosticFixture
} from './compiler-diagnostic-build.js';

const workspace = fileURLToPath(new URL('../../', import.meta.url));

/** Builds one private paired package and consumer, retaining cleanup ownership for the caller. */
export async function prepareHydrationHandoffFixture(adapter: 'vite' | 'webpack' | 'bun') {
	const parent = path.join(workspace, '.tmp/hydration-handoff-adapters');
	await mkdir(parent, { recursive: true });
	const root = await mkdtemp(path.join(parent, adapter + '-'));
	try {
		await copyInstalledRuntimePackages(root, [
			'@exactjs/core',
			'@exactjs/dom',
			'@exactjs/hydrate',
			'@exactjs/ssr',
			'@exactjs/jsx',
			'@exactjs/theme',
			'@exactjs/server'
		]);
		const producer = path.join(root, 'producer');
		await mkdir(path.join(producer, 'src'), { recursive: true });
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({
				name: '@fixture/hydration-handoff',
				private: true,
				type: 'module',
				dependencies: { '@fixture/handoff-ui': '0.8.0' }
			})
		);
		await writeFile(
			path.join(root, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					target: 'ESNext',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					jsx: 'preserve',
					strict: true
				},
				include: ['*.ts', '*.tsx']
			})
		);
		await writeFile(path.join(root, 'exact.config.mjs'), 'export default {};');
		await writeFile(
			path.join(producer, 'package.json'),
			JSON.stringify({
				name: '@fixture/handoff-ui',
				version: '0.8.0',
				private: true,
				type: 'module',
				files: ['dist'],
				sideEffects: false,
				exports: {
					'.': {
						types: './dist/index.d.ts',
						browser: './dist/client/index.js',
						default: './dist/server/index.js'
					},
					// Keep the replacement control's static import off the resumption entry.
					'./owner': {
						types: './dist/Handoff.d.ts',
						browser: './dist/client/Handoff.js',
						default: './dist/server/Handoff.js'
					}
				},
				exactCompiledComponents: ['HandoffFold', 'HandoffOwner'],
				exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' },
				dependencies: {
					'@exactjs/core': '^0.8.0',
					'@exactjs/jsx': '^0.8.0',
					'@exactjs/theme': '^0.8.0',
					'@exactjs/component-library': '^0.8.0',
					'@exactjs/dom': '^0.8.0',
					'@exactjs/ssr': '^0.8.0'
				}
			})
		);
		await writeFile(
			path.join(producer, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					jsx: 'react-jsx',
					jsxImportSource: '@exactjs/jsx',
					strict: true,
					skipLibCheck: true,
					declaration: true,
					emitDeclarationOnly: true,
					rootDir: 'src',
					outDir: 'dist'
				},
				include: ['src']
			})
		);
		await cp(
			path.join(
				workspace,
				'packages/component-composition-corpus/src/test-support/hydration-handoff.fixtures.tsx'
			),
			path.join(producer, 'src/Handoff.tsx')
		);
		await writeFile(
			path.join(producer, 'src/index.ts'),
			"export {HandoffFold,HandoffOwner} from './Handoff.js';"
		);
		await buildLibrary({ root: producer });
		const installed = path.join(root, 'node_modules/@fixture/handoff-ui');
		await mkdir(installed, { recursive: true });
		await cp(path.join(producer, 'dist'), path.join(installed, 'dist'), { recursive: true });
		await cp(path.join(producer, 'package.json'), path.join(installed, 'package.json'));
		await rm(producer, { recursive: true });
		const page = path.join(root, 'Page.tsx');
		await writeFile(
			page,
			'import {HandoffFold} from \'@fixture/handoff-ui\';\n/** @exact server */\nexport function Page(){return()=> <main><HandoffFold label="Three frames"><ul className="handoff-items"><li>First frame</li><li>Second frame</li><li>Third frame</li></ul></HandoffFold></main>;}'
		);
		const artifacts = await compileProjectArtifacts([page], {
			rootDir: root,
			outDir: path.join(root, 'generated'),
			serverComponents: true
		});
		await writeFile(
			path.join(root, 'hydration-registration.ts'),
			createExactHydrationRegistrationModule(
				createExactArtifactGraph(artifacts, { packageRoot: root, rootDir: root })
			)
		);
		const entries: Partial<Record<'client' | 'server', string>> = {};
		for (const target of ['server', 'client'] as const) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				target === 'server'
					? "import {Page} from './Page.js';import {renderToHydratableString} from '@exactjs/ssr';export const serverHtml=()=>renderToHydratableString(<Page/>);"
					: "import {createExactClient,readExactHydrationConfig} from '@exactjs/hydrate';import {HandoffOwner} from '@fixture/handoff-ui/owner';import {render,unmount} from '@exactjs/dom';import {createExactRuntimeInspectionOwner} from '@exactjs/core';export {unmount,createExactRuntimeInspectionOwner};export const replacePage=(root:Element)=>render(<HandoffOwner/>,root);import {exactHydrationRegistration} from './hydration-registration.js';export const mountPage=(root:Element,options={})=>createExactClient(root,{...readExactHydrationConfig(root),...exactHydrationRegistration,...options});"
			);
			const warnings = await buildDiagnosticFixture(
				adapter,
				root,
				target,
				false,
				true,
				false,
				root
			);
			await assertDiagnosticBuildWarnings(adapter, root, target, warnings);
			const file = (await readdir(path.join(root, 'out-' + target))).find((name) =>
				/^entry\.(?:js|mjs|cjs)$/.test(name)
			);
			assert.ok(file, `${adapter} emitted no ${target} entry`);
			entries[target] = './out-' + target + '/' + file;
		}
		assert.ok(entries.server && entries.client);
		return {
			root,
			entries: { server: entries.server, client: entries.client },
			dispose: () => rm(root, { recursive: true, force: true })
		};
	} catch (error) {
		await rm(root, { recursive: true, force: true });
		throw error;
	}
}

/** Exercises real packaged children through each adapter's independent production hydration boundary. */
export async function verifyHydrationHandoffContract(
	adapter: 'vite' | 'webpack' | 'bun'
): Promise<void> {
	const fixture = await prepareHydrationHandoffFixture(adapter);
	const { root, entries } = fixture;
	try {
		const evidence = process.env.EXACT_HANDOFF_EVIDENCE_DIR
			? path.join(process.env.EXACT_HANDOFF_EVIDENCE_DIR, adapter)
			: undefined;
		if (evidence) await mkdir(evidence, { recursive: true });
		const serverRunner = path.join(root, 'render.mjs');
		await writeFile(
			serverRunner,
			`import {writeFile} from 'node:fs/promises';const imported=await import(${JSON.stringify(entries.server)});const api=imported.serverHtml?imported:imported.default;await writeFile(new URL('./ssr.html',import.meta.url),(await api.serverHtml()).htmlWithHydration);`
		);
		await promisify(execFile)(process.execPath, [serverRunner], { cwd: root });
		const journey = await readFile(
			path.join(
				workspace,
				'packages/component-composition-corpus/test-support/hydration-handoff-journey.mjs'
			),
			'utf8'
		);
		await writeFile(path.join(root, 'journey.mjs'), journey);
		if (evidence) await cp(path.join(root, 'ssr.html'), path.join(evidence, 'ssr.html'));
		await promisify(execFile)(
			process.execPath,
			[
				path.join(workspace, 'framework-adapters/test-support/hydration-handoff-browser.mjs'),
				JSON.stringify({
					entries,
					evidence,
					modes: process.env.EXACT_HANDOFF_ADOPTION_ONLY ? ['adopt'] : undefined
				})
			],
			{ cwd: root, maxBuffer: 1024 * 1024 }
		);
		if (adapter === 'vite')
			for (const mode of ['control', 'enqueue-dispose', 'target-dispose', 'target-replace'])
				await promisify(execFile)(
					process.execPath,
					[
						path.join(workspace, 'framework-adapters/test-support/hydration-handoff-plan.mjs'),
						JSON.stringify({ entries, evidence, mode })
					],
					{ cwd: root, maxBuffer: 1024 * 1024 }
				);
	} finally {
		await fixture.dispose();
	}
}
