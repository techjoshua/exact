import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	createNativeCompilerBuildKey,
	isNativeCompilerBuildCurrent,
	writeNativeCompilerBuildStamp
} from './native-compiler-build-cache.mjs';

test('the native compiler cache follows repository-owned build inputs', async (context) => {
	const root = await fixtureRepository(context);
	const first = await createNativeCompilerBuildKey({
		repositoryRoot: root,
		revision: 'pinned-revision',
		target: 'linux-x64'
	});
	await writeFile(
		path.join(root, 'native', 'typescript-go', 'overlay', 'cmd', 'main.go'),
		'package main\n// changed\n'
	);
	const changed = await createNativeCompilerBuildKey({
		repositoryRoot: root,
		revision: 'pinned-revision',
		target: 'linux-x64'
	});
	const otherTarget = await createNativeCompilerBuildKey({
		repositoryRoot: root,
		revision: 'pinned-revision',
		target: 'win32-x64'
	});

	assert.notEqual(changed, first);
	assert.notEqual(otherTarget, changed);
});

test('a native compiler build is reused only with its matching successful stamp', async (context) => {
	const root = await fixtureRepository(context);
	const executable = path.join(root, 'exactc-native');
	const stampFile = path.join(root, 'build.json');
	await writeFile(executable, 'binary');

	assert.equal(
		await isNativeCompilerBuildCurrent({ executable, stampFile, buildKey: 'expected' }),
		false
	);
	await writeNativeCompilerBuildStamp(stampFile, 'expected', executable);
	assert.equal(
		await isNativeCompilerBuildCurrent({ executable, stampFile, buildKey: 'expected' }),
		true
	);
	await writeFile(executable, 'damaged binary');
	assert.equal(
		await isNativeCompilerBuildCurrent({ executable, stampFile, buildKey: 'expected' }),
		false
	);
	assert.equal(
		await isNativeCompilerBuildCurrent({
			executable,
			stampFile,
			buildKey: 'expected',
			bypassCache: true
		}),
		false
	);
});

async function fixtureRepository(context) {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-native-cache-'));
	context.after(() => rm(root, { recursive: true, force: true }));
	const files = {
		'native/typescript-go/upstream.json': '{"revision":"pinned-revision"}\n',
		'native/typescript-go/overlay/cmd/main.go': 'package main\n',
		'scripts/build-native-compiler.mjs': '// build host\n',
		'scripts/native-compiler-build-cache.mjs': '// cache host\n',
		'scripts/native-compiler-source.mjs': '// source resolver\n'
	};
	for (const [relative, contents] of Object.entries(files)) {
		const filename = path.join(root, relative);
		await mkdir(path.dirname(filename), { recursive: true });
		await writeFile(filename, contents);
	}
	return root;
}
