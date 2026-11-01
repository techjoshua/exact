import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

/** Exercises declaration advisories through actual build hosts and their existing warning sinks. */
export async function verifyDetachedServerAdvisory(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
) {
	const definition = `async function run(task:TaskContext=TaskContext.server().detached()){return 1;}`;
	const source = (prefix: string, body = definition) =>
		`import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{}>){${prefix}${body}return()=> <p>ready</p>;}`;
	for (const target of ['client', 'server'] as const) {
		await writeFile(path.join(root, 'entry.tsx'), source(''));
		const build = () =>
			buildDiagnosticFixture(
				adapter,
				root,
				target,
				false,
				false,
				false,
				process.env.EXACT_DIAGNOSTIC_PACKAGE_ROOT
			);
		const warnings = (await build()).filter((w) => w.includes('EXACT2004'));
		assert.equal(
			warnings.length,
			1,
			`${adapter}/${target} lost or duplicated advisory: ${warnings}`
		);
		assert.match(warnings[0]!, /entry\.tsx:1:\d+/);
		await writeFile(path.join(root, 'entry.tsx'), source('/** @exact ignore=EXACT2004 */'));
		assert.equal((await build()).filter((w) => w.includes('EXACT2004')).length, 0);
		await writeFile(
			path.join(root, 'entry.tsx'),
			source(
				'/** @exact ignore=EXACT2004 */',
				`async function run(task:TaskContext=TaskContext.server().detached()){document.title='unsafe';}run();`
			)
		);
		await assert.rejects(build(), /EXACT|browser|document/);
	}
}
