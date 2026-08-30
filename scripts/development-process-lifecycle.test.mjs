import { EventEmitter } from 'node:events';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { installDevelopmentProcessLifecycle } from './development-process-lifecycle.mjs';
import { parseOwnedCommandArguments } from './start-owned-development-command.mjs';
import { parseOwnedViteArguments } from './start-owned-vite-dev-server.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('parent disappearance closes and exits a development process exactly once', async () => {
	const host = fakeProcessHost('win32');
	let poll;
	let closeCount = 0;
	const exits = [];
	const lifecycle = installDevelopmentProcessLifecycle({
		label: 'test server',
		close: async () => closeCount++,
		parentPid: 42,
		processHost: host,
		processExists: () => false,
		setIntervalHost: (callback) => ((poll = callback), 7),
		clearIntervalHost: () => undefined,
		exit: (code) => exits.push(code)
	});
	poll();
	poll();
	await lifecycle.shutdown('test-duplicate');

	assert.equal(closeCount, 1);
	assert.deepEqual(exits, [0]);
});

test('signal and explicit shutdown share one cleanup settlement', async () => {
	const host = fakeProcessHost('linux');
	let closeCount = 0;
	const exits = [];
	const lifecycle = installDevelopmentProcessLifecycle({
		label: 'test server',
		close: async () => closeCount++,
		parentPid: 42,
		processHost: host,
		processExists: () => true,
		setIntervalHost: () => 7,
		clearIntervalHost: () => undefined,
		exit: (code) => exits.push(code)
	});
	host.emit('SIGTERM');
	await lifecycle.shutdown('second-request');

	assert.equal(closeCount, 1);
	assert.deepEqual(exits, [0]);
});

test('owned Vite arguments preserve app and config-relative paths', () => {
	const launch = path.resolve('framework-comparison');
	const options = parseOwnedViteArguments(
		['--root', 'participants/sveltekit', '--config', 'vite.config.ts', '--port', '4403'],
		launch
	);
	assert.equal(options.root, path.join(launch, 'participants/sveltekit'));
	assert.equal(options.configFile, path.join(launch, 'vite.config.ts'));
	assert.equal(options.port, 4403);
});

test('owned command arguments require an explicit command boundary', () => {
	const options = parseOwnedCommandArguments([
		'--label',
		'Nuxt comparison',
		'--cwd',
		'participants/nuxt',
		'--',
		'node',
		'nuxt.mjs',
		'dev'
	]);
	assert.equal(options.label, 'Nuxt comparison');
	assert.equal(options.command, 'node');
	assert.deepEqual(options.arguments, ['nuxt.mjs', 'dev']);
});

test('repository development scripts do not invoke Vite or Nuxt without an owner', async () => {
	const violations = [];
	for (const manifestPath of await repositoryPackageManifests(repositoryRoot)) {
		const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
		for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
			if ((name === 'dev' || name.startsWith('dev:')) && directlyLaunchesServer(command)) {
				violations.push(`${path.relative(repositoryRoot, manifestPath)} [${name}] ${command}`);
			}
		}
	}
	assert.deepEqual(violations, []);
});

function fakeProcessHost(platform) {
	const host = new EventEmitter();
	host.platform = platform;
	host.stderr = { write() {} };
	return host;
}

/** Finds source-controlled package manifests without traversing generated dependency trees. */
async function repositoryPackageManifests(directory) {
	const manifests = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (entry.isFile() && entry.name === 'package.json')
			manifests.push(path.join(directory, entry.name));
		else if (entry.isDirectory() && !ignoredRepositoryDirectory(entry.name)) {
			manifests.push(...(await repositoryPackageManifests(path.join(directory, entry.name))));
		}
	}
	return manifests;
}

/** Excludes dependency, generated, cache, and VCS directories from the package-script audit. */
function ignoredRepositoryDirectory(name) {
	return new Set(['.exact', '.git', '.tmp', '.vite', 'coverage', 'dist', 'node_modules']).has(name);
}

/** Detects bare server CLIs while allowing the named shared owner scripts. */
function directlyLaunchesServer(command) {
	return /(?:^|[\s;&|])(?:npx\s+)?(?:vite|nuxt)(?=\s|$)/u.test(command);
}
