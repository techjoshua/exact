import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
	assertDiagnosticBuildWarnings,
	buildDiagnosticFixture
} from './compiler-diagnostic-build.js';
import {
	reassignedCallableCases,
	reassignedCallableProject,
	reassignedCallableVerifier
} from './reassigned-callable-fixture.js';

const execute = promisify(execFile);
const workspace = fileURLToPath(new URL('../../', import.meta.url));

/** Runs the same callback replacement contract through each adapter's real build hooks. */
export async function verifyReassignedCallableModules(adapter: 'vite' | 'webpack' | 'bun') {
	await mkdir(path.join(workspace, '.tmp'), { recursive: true });
	const root = await mkdtemp(path.join(workspace, '.tmp/reassigned-callable-'));
	try {
		const entry = path.join(root, 'entry.tsx');
		await Promise.all([
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/reassigned-callable', type: 'module', private: true })
			),
			writeFile(path.join(root, 'exact.config.mjs'), 'export default {};'),
			writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify(reassignedCallableProject('entry.tsx'))
			)
		]);
		for (const fixture of reassignedCallableCases) {
			await writeFile(entry, fixture.source);
			for (const target of ['client', 'server'] as const) {
				// Plain modules use the adapter's public source-ownership declaration.
				const warnings = await buildDiagnosticFixture(
					adapter,
					root,
					target,
					false,
					true,
					false,
					undefined,
					[entry]
				);
				await assertDiagnosticBuildWarnings(adapter, root, target, warnings);
				const output = path.join(
					root,
					`out-${target}`,
					adapter === 'webpack' ? 'entry.cjs' : 'entry.js'
				);
				const verifier = path.join(root, 'verify.mjs');
				await writeFile(
					verifier,
					reassignedCallableVerifier(pathToFileURL(output).href, fixture.browser, target)
				);
				const result = await execute(
					adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
					[verifier],
					{ cwd: root, timeout: 30000 }
				);
				assert.equal(result.stdout.trim(), 'reassigned callable artifact retained', fixture.name);
			}
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
