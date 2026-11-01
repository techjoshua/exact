import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
	callbackTaskHelper,
	callbackTaskSource
} from '../../packages/compiler/src/test-support/task-callback-sources.js';
import {
	buildDiagnosticFixture,
	assertDiagnosticBuildWarnings
} from './compiler-diagnostic-build.js';
const workspace = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Qualifies callback task ownership through both real adapter targets and an actual executor request.
 * The caller owns the fixture. Builds and the finite server probe settle before returning.
 */
export async function verifyTaskCallbackOwnerContract(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
): Promise<void> {
	await mkdir(root, { recursive: true });
	await writeFile(
		path.join(root, 'package.json'),
		'{"name":"@fixture/task-callback-owner","type":"module","private":true}'
	);
	await writeFile(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				module: 'NodeNext',
				moduleResolution: 'NodeNext',
				strict: true,
				jsx: 'preserve',
				jsxImportSource: '@exactjs/jsx',
				types: ['node']
			},
			include: ['*.ts', '*.tsx']
		})
	);
	await writeFile(path.join(root, 'page.tsx'), callbackTaskSource({ form: 'named' }));
	await writeFile(path.join(root, 'helper.ts'), callbackTaskHelper('named'));
	for (const target of ['client', 'server'] as const) {
		await writeFile(
			path.join(root, 'entry.tsx'),
			target === 'client'
				? `export{Page}from './page.js';`
				: `import{Page}from './page.js';import{composeExactExecutorContract,handleExactRequest}from '@exactjs/server';
export async function verify(){const contract=composeExactExecutorContract([Page]);const operations=Object.values(contract.invocations);if(operations.length!==1)throw new Error('Missing child operation');const operation=operations[0];const response=await handleExactRequest({method:'POST',url:'http://localhost/__exact',headers:{origin:'http://localhost','content-type':'application/json'},body:{type:'invoke',id:operation.id,state:{revision:0,draft:''},payload:{dependencies:[':input'],generation:1}}},{contract,invocations:{}});return{status:response.status,body:JSON.parse(response.body as string)};}`
		);
		const warnings = await buildDiagnosticFixture(
			adapter,
			root,
			target,
			false,
			true,
			false,
			workspace
		);
		await writeFile(path.join(root, target + '-warnings.json'), JSON.stringify(warnings));
		await assertDiagnosticBuildWarnings(adapter, root, target, warnings);
	}
	const out = path.join(root, 'out-server'),
		file = (await readdir(out)).find((name) => /^entry\.(?:js|mjs|cjs)$/.test(name));
	assert.ok(file, 'Missing server artifact');
	const runner = path.join(root, 'verify.mjs');
	await writeFile(
		runner,
		`const loaded=await import(${JSON.stringify('./out-server/' + file)});console.log(JSON.stringify(await(loaded.verify?loaded:loaded.default).verify()));`
	);
	const execution = await promisify(execFile)(
		adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
		[runner],
		{ cwd: root }
	);
	await writeFile(path.join(root, 'execution.stdout.log'), execution.stdout);
	await writeFile(path.join(root, 'execution.stderr.log'), execution.stderr);
	const result = JSON.parse(execution.stdout);
	await writeFile(path.join(root, 'observation.json'), JSON.stringify(result));
	assert.equal(result.status, 200);
	assert.equal(result.body.ok, true);
	assert.equal(result.body.value, path.resolve(root, 'data') + ':input');
	// Server-only callback work remains absent from the browser's emitted program.
	for (const name of await readdir(path.join(root, 'out-client')))
		if (/\.(?:mjs|js|cjs)$/.test(name))
			assert.ok(
				!(await readFile(path.join(root, 'out-client', name), 'utf8')).includes('process.cwd()')
			);
}
