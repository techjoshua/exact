import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { componentInputInvarianceConsumers } from '../../packages/compiler/src/test-support/component-input-invariance-consumers.js';
import {
	componentInputOverrideConsumers,
	componentInputDormantGetterSource
} from '../../packages/compiler/src/test-support/component-input-invariance-overrides.js';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

const execute = promisify(execFile);
const workspace = fileURLToPath(new URL('../../', import.meta.url));

// Integration seams, with complete source compositions retained in native/SDK tables.
const adapterOverrideNames = new Set([
	'spreadBefore',
	'spreadAfter',
	'explicitOverride',
	'unknownKeyBrowser',
	'serverBefore',
	'literalMethod'
]);

/**
 * Checks invoked and dormant callable inputs through both real adapter targets.
 * The optional package root selects retained installed providers for package acceptance.
 * Every fixture, compiler process and artifact verifier is released before returning.
 */
export async function verifyComponentCallableInputs(
	adapter: 'vite' | 'webpack' | 'bun',
	packageRoot?: string
): Promise<void> {
	await mkdir(path.join(workspace, '.tmp'), { recursive: true });
	const root = await mkdtemp(path.join(workspace, '.tmp/component-callable-'));
	try {
		if (packageRoot)
			await symlink(
				path.join(packageRoot, 'node_modules'),
				path.join(root, 'node_modules'),
				'junction'
			);
		const files = [
			'component-input-invariance.fixtures.tsx',
			'component-input-invariance-dormant.fixtures.tsx'
		];
		for (const file of files)
			await writeFile(
				path.join(root, file),
				await readFile(path.join(workspace, 'packages/compiler/src/test-support', file))
			);
		await writeFile(
			path.join(root, 'package.json'),
			'{"name":"@fixture/callable-input","type":"module","private":true}'
		);
		await writeFile(path.join(root, 'exact.config.mjs'), 'export default {};');
		await writeFile(
			path.join(root, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					target: 'ES2022',
					module: 'NodeNext',
					moduleResolution: 'NodeNext',
					strict: true,
					lib: ['ES2022', 'DOM'],
					types: ['node'],
					jsx: 'preserve',
					jsxImportSource: '@exactjs/jsx',
					skipLibCheck: true,
					noEmit: true
				},
				files: ['entry.tsx', 'page.tsx', ...files]
			})
		);
		const recipes = [
			...(['namedSafe', 'mutable', 'namedSpellingBrowser'] as const).map((name) => ({
				name,
				source: componentInputInvarianceConsumers[name],
				uncertain: name === 'mutable',
				expected:
					name === 'namedSafe'
						? 'safesafecaptured'
						: name === 'namedSpellingBrowser'
							? 'browserbrowser'
							: undefined,
				runtimeTarget: name === 'namedSpellingBrowser' ? 'client' : 'both',
				counters: false
			})),
			// Native and SDK tables cover the remaining source compositions.
			...componentInputOverrideConsumers
				.filter((recipe) => adapterOverrideNames.has(recipe.name))
				.map((recipe) => ({
					name: recipe.name,
					source: recipe.source,
					uncertain: recipe.placement === 'unknown',
					expected:
						recipe.name === 'explicitOverride'
							? 'edgeedge'
							: recipe.name === 'serverBefore'
								? 'edgeedge' + process.platform
								: recipe.name === 'spreadAfter'
									? 'edgeedge'
									: undefined,
					runtimeTarget:
						recipe.name === 'serverBefore'
							? 'server'
							: recipe.name === 'spreadAfter'
								? 'client'
								: 'both',
					counters: false
				})),
			{
				name: 'dormantGetter',
				source: componentInputDormantGetterSource,
				uncertain: false,
				expected: 'edge',
				runtimeTarget: 'both',
				counters: true
			}
		];
		for (const recipe of recipes) {
			await writeFile(path.join(root, 'page.tsx'), recipe.source);
			for (const target of ['server', 'client'] as const) {
				// Verifiers share the artifact's capability and reactive-record owners.
				await writeFile(
					path.join(root, 'entry.tsx'),
					`export * from './page.js';export {createCompiledComponentInputReceipt as __verifyReceipt} from '@exactjs/core/runtime/component-operations';${target === 'server' ? "export {renderToString as __verifySSR} from '@exactjs/ssr';" : "export {render as __verifyRender,unmount as __verifyUnmount} from '@exactjs/dom';"}`
				);
				const warnings = await buildDiagnosticFixture(
					adapter,
					root,
					target,
					false,
					true,
					false,
					packageRoot,
					[path.join(root, 'page.tsx'), ...files.map((file) => path.join(root, file))],
					['@exactjs/core', '@exactjs/ssr', '@exactjs/reactive', '@exactjs/dom']
				);
				if (recipe.uncertain) {
					assert.ok(
						warnings.some(
							(warning) =>
								warning.includes('EXACT2212') && warning.includes('unresolved native render edge')
						),
						warnings.join('\n')
					);
					assert.ok(
						warnings.every((warning) => !warning.includes('compatibility adapter')),
						warnings.join('\n')
					);
				} else assert.equal(warnings.length, 0, warnings.join('\n'));
				if (
					recipe.expected === undefined ||
					(recipe.runtimeTarget !== 'both' && recipe.runtimeTarget !== target)
				)
					continue;
				const output = path.join(root, 'out-' + target);
				const entry =
					adapter === 'webpack'
						? 'entry.cjs'
						: (await readdir(output)).find((file) => /^entry\.(?:m?js)$/.test(file));
				assert.ok(entry, 'missing adapter artifact');
				const check =
					target === 'server'
						? `const renderToString=imported.__verifySSR??imported.default?.__verifySSR;const createCompiledComponentInputReceipt=imported.__verifyReceipt??imported.default?.__verifyReceipt;${recipe.counters ? "await assert.rejects(()=>renderToString(createCompiledComponentInputReceipt(Parent,{}),{markers:false}),error=>error instanceof Error&&error.message.includes('props must be JSON-serializable')&&error.message.includes('$.read'));" : `const result=await renderToString(createCompiledComponentInputReceipt(Parent,{}),{markers:false});assert.ok(result.html.includes(${JSON.stringify(recipe.expected)}),result.html);`}`
						: `const {JSDOM}=await import('jsdom');const dom=new JSDOM('<!doctype html><body></body>');for(const key of ['window','document',...Object.getOwnPropertyNames(dom.window).filter(key=>/^HTML.*Element$/.test(key)),'Node','Element','HTMLElement','Text','Comment','DocumentFragment','MutationObserver'])globalThis[key]=dom.window[key];const render=imported.__verifyRender??imported.default?.__verifyRender;const unmount=imported.__verifyUnmount??imported.default?.__verifyUnmount;const receipt=imported.__verifyReceipt??imported.default?.__verifyReceipt;const host=document.createElement('div');document.body.append(host);const reports=[];try{render(receipt(Parent,{}),host,{onErrorReport:report=>reports.push(report.error)});assert.ok(host.textContent.includes(${JSON.stringify(recipe.expected)}),host.innerHTML);assert.deepEqual(reports,[])}finally{unmount(host);host.remove();dom.window.close()}`;
				const verifier = path.join(root, 'verify.mjs');
				await writeFile(
					verifier,
					`import assert from 'node:assert/strict';const imported=await import('./out-${target}/${entry}');const Parent=imported.Parent??imported.default?.Parent;assert.equal(typeof Parent,'function');${check}${recipe.counters ? 'const counters=imported.counters??imported.default?.counters;assert.deepEqual(counters(),{gets:1,calls:0});' : ''}`
				);
				const result = await execute(
					'node',
					[...(target === 'client' ? ['--conditions=browser'] : []), verifier],
					{ timeout: 30000 }
				).catch((error: unknown) => {
					throw new Error(adapter + '/' + recipe.name + '/' + target, { cause: error });
				});
				assert.equal(result.stderr, '', 'unexpected framework report');
			}
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
