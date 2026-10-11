import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { expect } from 'vitest';
import { writeApplicationRootFixture } from './application-root-fixture.js';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

/** Checks host-root ownership through a real build launched outside the application. */
export async function verifyApplicationRoot(adapter: 'webpack' | 'bun', explicit = false) {
	const temporary = path.resolve('.tmp/application-root');
	await mkdir(temporary, { recursive: true });
	const root = await mkdtemp(path.join(temporary, 'app-'));
	try {
		await writeApplicationRootFixture(root);
		await buildDiagnosticFixture(
			adapter,
			root,
			'server',
			false,
			true,
			explicit ? 'override' : true
		);
		const entry = path.join(root, 'out-server', adapter === 'webpack' ? 'entry.cjs' : 'entry.js');
		const runner = path.join(root, 'run.mjs');
		await writeFile(
			runner,
			`import * as entry from ${JSON.stringify(pathToFileURL(entry).href)};console.log(await (entry.run??entry.default.run)());`
		);
		const result = await promisify(execFile)(
			adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
			[runner]
		);
		expect(result.stdout).toContain('data-root="owned"');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
