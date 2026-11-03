import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { componentInputInvarianceConsumers } from '../../packages/compiler/src/test-support/component-input-invariance-consumers.js';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

const execute = promisify(execFile);
const workspace = fileURLToPath(new URL('../../', import.meta.url));

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
					types: [],
					jsx: 'preserve',
					jsxImportSource: '@exactjs/jsx',
					skipLibCheck: true,
					noEmit: true
				},
				files: ['entry.tsx', ...files]
			})
		);
		for (const name of ['namedSafe', 'namedBrowser', 'dormantBrowser', 'mutable'] as const) {
			await writeFile(path.join(root, 'entry.tsx'), componentInputInvarianceConsumers[name]);
			for (const target of ['server', 'client'] as const) {
				const warnings = await buildDiagnosticFixture(
					adapter,
					root,
					target,
					false,
					true,
					false,
					packageRoot,
					[path.join(root, 'entry.tsx'), ...files.map((file) => path.join(root, file))]
				);
				if (name === 'mutable') {
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
				if (name !== 'namedSafe') continue;
				const output = path.join(root, 'out-' + target);
				const entry =
					adapter === 'webpack'
						? 'entry.cjs'
						: (await readdir(output)).find((file) => /^entry\.(?:m?js)$/.test(file));
				assert.ok(entry, 'missing adapter artifact');
				const check =
					target === 'server'
						? `const {renderToString}=await import('@exactjs/ssr');const {createCompiledComponentInputReceipt}=await import('@exactjs/core/runtime/component-operations');const result=await renderToString(createCompiledComponentInputReceipt(Parent,{}),{markers:false});assert.ok(result.html.includes('safesafecaptured'),result.html);`
						: `const {JSDOM}=await import('jsdom');const dom=new JSDOM('<!doctype html><body></body>');for(const key of ['window','document',...Object.getOwnPropertyNames(dom.window).filter(key=>/^HTML.*Element$/.test(key)),'Node','Element','HTMLElement','Text','Comment','DocumentFragment','MutationObserver'])globalThis[key]=dom.window[key];const {testComponent}=await import('@exactjs/testing');const view=await testComponent(Parent).mount();try{assert.ok(document.body.textContent.includes('safesafecaptured'),document.body.innerHTML)}finally{view.unmount();dom.window.close()}`;
				const verifier = path.join(root, 'verify.mjs');
				await writeFile(
					verifier,
					`import assert from 'node:assert/strict';const imported=await import('./out-${target}/${entry}');const Parent=imported.Parent??imported.default?.Parent;assert.equal(typeof Parent,'function');${check}`
				);
				const result = await execute(
					'node',
					[...(target === 'client' ? ['--conditions=browser'] : []), verifier],
					{ timeout: 30000 }
				);
				assert.equal(result.stderr, '', 'unexpected framework report');
			}
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
