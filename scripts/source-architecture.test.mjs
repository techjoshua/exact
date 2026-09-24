import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkSourceArchitecture } from './source-architecture.mjs';

async function workspace(t, source) {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-architecture-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await Promise.all(
		[
			'packages/example/src',
			'framework-adapters',
			'react-adapters',
			'plugins',
			'component-libraries',
			'apps',
			'scripts'
		].map((dir) => mkdir(path.join(root, dir), { recursive: true }))
	);
	const file = path.join(root, 'packages/example/src/index.ts');
	await writeFile(file, source);
	return { root, file };
}

for (const invalid of [false, true])
	test(`waits for delayed ${invalid ? 'invalid' : 'valid'} source inspection`, async (t) => {
		const { root, file } = await workspace(
			t,
			invalid
				? 'export function entry(){let n=0;n++;n++;return n;}'
				: 'export { value } from "./value.js";'
		);
		let release, entered;
		const gate = new Promise((r) => {
			release = r;
		});
		const reading = new Promise((r) => {
			entered = r;
		});
		let finished = false;
		const check = checkSourceArchitecture(root, {
			readSource: async (name, ...args) => {
				if (name === file) {
					entered();
					await gate;
				}
				return readFile(name, ...args);
			}
		});
		const result = check.then(
			() => {
				finished = true;
				return null;
			},
			(error) => {
				finished = true;
				return error;
			}
		);
		await reading;
		await new Promise((r) => setImmediate(r));
		assert.equal(finished, false);
		release();
		const error = await result;
		if (invalid) assert.match(error.message, /public entrypoint contains implementation/);
		else assert.equal(error, null);
	});

test('fails when a source read fails', async (t) => {
	const { root, file } = await workspace(t, 'export const value=1;');
	await assert.rejects(
		checkSourceArchitecture(root, {
			readSource: async (name, ...args) => {
				if (name === file) throw new Error('fixture read failure');
				return readFile(name, ...args);
			}
		}),
		/fixture read failure/
	);
});
