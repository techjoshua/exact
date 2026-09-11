import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stageNativeCompilerPackage } from './package-native-compiler.mjs';

test('native staging preserves upstream license and notices with platform restrictions', async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'exact-native-notices-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const template = path.join(root, 'native/npm/compiler-native-linux-x64');
	await mkdir(template, { recursive: true });
	await mkdir(path.join(root, 'packages/compiler'), { recursive: true });
	await writeFile(
		path.join(template, 'package.json'),
		JSON.stringify({
			name: '@exactjs/compiler-native-linux-x64',
			private: true,
			version: '0.1.0',
			exactNativeTarget: { os: 'linux', cpu: 'x64' }
		})
	);
	await writeFile(path.join(template, 'README.md'), 'Native compiler');
	await writeFile(
		path.join(root, 'packages/compiler/package.json'),
		JSON.stringify({ version: '0.5.0' })
	);
	const executable = path.join(root, 'exactc');
	const license = path.join(root, 'LICENSE.txt');
	const notice = path.join(root, 'NOTICE.txt');
	await writeFile(executable, 'test binary');
	await writeFile(license, 'upstream license\n');
	await writeFile(notice, 'upstream notices\n');
	await writeFile(path.join(root, 'LICENSE'), 'eXact license\n');
	await writeFile(path.join(root, 'NOTICE'), 'eXact notice\n');
	const staged = await stageNativeCompilerPackage({
		root,
		executable,
		license,
		notice,
		platform: 'linux',
		arch: 'x64'
	});
	assert.equal(
		await readFile(path.join(staged, 'LICENSE.typescript-go'), 'utf8'),
		'upstream license\n'
	);
	assert.equal(
		await readFile(path.join(staged, 'NOTICE.typescript'), 'utf8'),
		'upstream notices\n'
	);
	const manifest = JSON.parse(await readFile(path.join(staged, 'package.json'), 'utf8'));
	assert.equal(manifest.private, undefined);
	assert.equal(manifest.version, '0.5.0');
	assert.deepEqual(manifest.os, ['linux']);
	assert.deepEqual(manifest.cpu, ['x64']);
	await assert.rejects(
		stageNativeCompilerPackage({
			root,
			executable,
			license,
			notice: path.join(root, 'missing'),
			platform: 'linux',
			arch: 'x64'
		}),
		/ENOENT/
	);
	assert.equal(
		await readFile(path.join(staged, 'NOTICE.typescript'), 'utf8'),
		'upstream notices\n'
	);
});
