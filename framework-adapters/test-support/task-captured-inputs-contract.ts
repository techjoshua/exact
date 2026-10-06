import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

/** Adapters preserve captured task types, context ownership, and transport policy checks. */
export async function verifyTaskCapturedInputsContract(
	adapter: 'vite' | 'webpack' | 'bun'
): Promise<void> {
	const parent = path.resolve('.tmp/task-captured-inputs-adapters');
	await mkdir(parent, { recursive: true });
	const root = await mkdtemp(path.join(parent, adapter + '-'));
	try {
		await Promise.all([
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/task-captured-inputs', type: 'module', private: true })
			),
			writeFile(path.join(root, 'exact.config.mjs'), 'export default {};'),
			writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						target: 'ESNext',
						module: 'ESNext',
						moduleResolution: 'Bundler',
						jsx: 'preserve',
						strict: true
					},
					include: ['*.tsx']
				})
			)
		]);
		const source = await readFile(
			path.resolve(
				'packages/component-composition-corpus/src/test-support/task-captured-inputs.fixtures.tsx'
			),
			'utf8'
		);
		const activationSource = await readFile(
			path.resolve(
				'packages/component-composition-corpus/src/test-support/task-activation-captures.fixtures.tsx'
			),
			'utf8'
		);
		for (const target of ['client', 'server'] as const) {
			for (const privateCapture of [false, true]) {
				await writeFile(
					path.join(root, 'entry.tsx'),
					privateCapture
						? activationSource.replace(
								'value: number = props.input + this.state.draft',
								'value: number = this.getContext(CapturePrivate)'
							)
						: activationSource
				);
				let failure: unknown;
				try {
					await buildDiagnosticFixture(adapter, root, target);
				} catch (error) {
					failure = error;
				}
				if (privateCapture)
					assert.ok(
						String(failure).includes('EXACT2001'),
						`${adapter}/${target} accepted a private default: ${String(failure)}`
					);
				else assert.equal(failure, undefined, `${adapter}/${target}: ${String(failure)}`);
			}
			await writeFile(
				path.join(root, 'entry.tsx'),
				source.replace('TaskContext.server()', 'TaskContext.client()')
			);
			await buildDiagnosticFixture(adapter, root, target);
			for (const valid of [true, false]) {
				await writeFile(
					path.join(root, 'entry.tsx'),
					valid
						? source
						: source.replace(
								'const selected = this.state.table[key];',
								'this.state.table[key]=0;const selected = this.state.table[key];'
							)
				);
				let failure: unknown;

				try {
					await buildDiagnosticFixture(adapter, root, target);
				} catch (error) {
					failure = error;
				}
				if (valid) assert.equal(failure, undefined, `${adapter}/${target}: ${String(failure)}`);
				else
					assert.ok(
						String(failure).includes('EXACT2001'),
						`${adapter}/${target} lost write authority: ${String(failure)}`
					);
			}
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
