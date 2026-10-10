import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Exercise real staging and packaging with bounded tool doubles, without generated outputs.
test('native release targets share preparation and host validation', async (context) => {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-native-targets-'));
	context.after(() => rm(root, { recursive: true, force: true }));
	const put = async (relative, contents) => {
		const filename = path.join(root, relative);
		await mkdir(path.dirname(filename), { recursive: true });
		await writeFile(filename, contents);
	};
	await mkdir(path.join(root, 'scripts'), { recursive: true });
	for (const filename of [
		'build-native-compiler.mjs',
		'checkout-native-typescript-go.mjs',
		'native-compiler-build-cache.mjs',
		'native-compiler-source.mjs',
		'package-native-compiler.mjs',
		'release-output-path.mjs'
	])
		await cp(path.resolve('scripts', filename), path.join(root, 'scripts', filename));
	await cp(
		path.resolve('scripts/compiler-confidence'),
		path.join(root, 'scripts/compiler-confidence'),
		{ recursive: true }
	);
	await cp(path.resolve('native/npm'), path.join(root, 'native/npm'), { recursive: true });
	await cp(
		path.resolve('packages/compiler/package.json'),
		path.join(root, 'compiler-manifest.json')
	);
	await put(
		'packages/compiler/package.json',
		await readFile(path.join(root, 'compiler-manifest.json'))
	);
	await put('LICENSE', 'fixture license');
	await put('NOTICE', 'fixture notice');
	const source = path.join(root, 'upstream');
	for (const owner of ['compiler', 'checker', 'exactcompiler']) {
		await put(`upstream/tsc/internal/${owner}/fixture.go`, 'old\n');
		await put(`native/typescript-go/overlay/internal/${owner}/fixture.go`, 'old\n');
	}
	await put('upstream/tsc/cmd/exactc/fixture.go', 'old\n');
	await put('native/typescript-go/overlay/cmd/exactc/fixture.go', 'old\n');
	for (const patch of [
		'internal/compiler/program.patch',
		'internal/printer/optional_chain.patch'
	]) {
		const file = patch.includes('program') ? 'compiler' : 'checker';
		await put(
			`native/typescript-go/overlay/${patch}`,
			`diff --git a/tsc/internal/${file}/fixture.go b/tsc/internal/${file}/fixture.go\n--- a/tsc/internal/${file}/fixture.go\n+++ b/tsc/internal/${file}/fixture.go\n@@ -1 +1 @@\n-old\n+new\n`
		);
	}
	await put('upstream/LICENSE.txt', 'upstream license');
	await put('upstream/NOTICE.txt', 'upstream notice');
	const log = path.join(root, 'commands.jsonl');
	const record = `const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({kind:KIND,os:process.env.GOOS,arch:process.env.GOARCH})+'\\n');`;
	await put('node_modules/typescript/bin/tsc6', record.replace('KIND', "'prepare'"));
	await put('upstream/tsc/test', record.replace('KIND', "'test'"));
	await put(
		'upstream/tsc/build',
		record.replace('KIND', "'build'") +
			"fs.writeFileSync(process.argv[process.argv.indexOf('-o')+1],process.env.GOOS+'-'+process.env.GOARCH);"
	);
	const git = (args) => execFileSync('git', args, { cwd: source, stdio: 'pipe' });
	git(['init']);
	git(['add', '.']);
	git([
		'-c',
		'user.name=Fixture',
		'-c',
		'user.email=fixture@example.test',
		'commit',
		'-m',
		'Fixture'
	]);
	await put(
		'native/typescript-go/upstream.json',
		JSON.stringify({ revision: git(['rev-parse', 'HEAD']).toString().trim() })
	);
	execFileSync(
		process.execPath,
		['scripts/build-native-compiler.mjs', '--all-targets', '--package', '--source', source],
		{
			cwd: root,
			env: { ...process.env, EXACT_GO: process.execPath },
			stdio: 'pipe',
			timeout: 30000
		}
	);
	const commands = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
	assert.equal(commands.filter((x) => x.kind === 'prepare').length, 1);
	assert.equal(commands.filter((x) => x.kind === 'test').length, 1);
	assert.equal(commands.filter((x) => x.kind === 'build').length, 6);
	for (const [platform, os] of [
		['linux', 'linux'],
		['darwin', 'darwin'],
		['win32', 'windows']
	]) {
		for (const [arch, goArch] of [
			['x64', 'amd64'],
			['arm64', 'arm64']
		]) {
			const target = `${platform}-${arch}`;
			const filename = platform === 'win32' ? 'exactc.exe' : 'exactc';
			assert.equal(
				await readFile(
					path.join(root, '.tmp/native-packages', `compiler-native-${target}`, filename),
					'utf8'
				),
				`${os}-${goArch}`
			);
			const stamp = JSON.parse(
				await readFile(path.join(root, '.tmp/native-compiler', `${target}.build.json`), 'utf8')
			);
			assert.ok(stamp.executableHash);
		}
	}
});
