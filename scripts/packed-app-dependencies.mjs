import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';
import { parseNpmPackOutput } from './npm-pack-output.mjs';

const execute = promisify(execFile);

/** Installs a candidate dependency closure with optional exact registry pins, without workspace links. */
export async function createPackedAppInstaller(workspace, temporary, released = {}) {
	const npm = process.env.npm_execpath;
	assert.ok(npm, 'Run packed application acceptance through npm');
	const catalog = new Map();
	for (const group of [
		'packages',
		'framework-adapters',
		'react-adapters',
		'plugins',
		'component-libraries',
		'agents'
	]) {
		for (const entry of await readdir(path.join(workspace, group), { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const root = path.join(workspace, group, entry.name);
			let manifest;
			try {
				manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
			} catch (error) {
				if (error.code === 'ENOENT') continue;
				throw error;
			}
			if (!manifest.private) catalog.set(manifest.name, { root, manifest });
		}
	}
	const artifacts = path.join(temporary, 'tarballs');
	await mkdir(artifacts);
	const packed = new Map();
	const releasedCatalog = new Map();
	const nativeName = `@exactjs/compiler-native-${process.platform}-${process.arch}`;
	const nativeDirectory =
		process.env.EXACT_NATIVE_PACKAGE_DIRECTORY ??
		path.join(workspace, '.tmp/native-artifact/native-package-artifacts');
	const nativeFiles = (await readdir(nativeDirectory)).filter(
		(name) =>
			name.startsWith(`exactjs-compiler-native-${process.platform}-${process.arch}-`) &&
			name.endsWith('.tgz')
	);
	assert.equal(nativeFiles.length, 1, `Expected one ${nativeName} tarball in ${nativeDirectory}`);
	assert.equal(
		nativeFiles[0],
		`exactjs-compiler-native-${process.platform}-${process.arch}-${catalog.get('@exactjs/compiler').manifest.version}.tgz`,
		'Packed acceptance requires the native compiler tarball for the candidate compiler version'
	);
	packed.set(nativeName, `file:${path.resolve(nativeDirectory, nativeFiles[0])}`);

	const npmRun = async (args, cwd) => {
		const env = { ...process.env };
		delete env.EXACT_COMPILER_EXECUTABLE;
		delete env.NODE_PATH;
		try {
			return await execute(process.execPath, [npm, ...args], {
				cwd,
				env,
				maxBuffer: 16 * 1024 * 1024
			});
		} catch (error) {
			throw new Error(`${args.join(' ')} failed\n${error.stdout}\n${error.stderr}`, {
				cause: error
			});
		}
	};

	return async (root) => {
		const manifestPath = path.join(root, 'package.json');
		const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
		const selected = new Set([nativeName]);
		const visit = async (name, range) => {
			if (!name.startsWith('@exactjs/')) return;
			if (name.startsWith('@exactjs/compiler-native-')) return;
			let entry = catalog.get(name);
			assert.ok(entry, `Missing candidate package ${name}`);
			if (Object.hasOwn(released, name)) {
				const version = released[name];
				assert.equal(
					semver.valid(version),
					version,
					`Release pin must be an exact version: ${name}`
				);
				if (!releasedCatalog.has(name)) {
					const { stdout } = await npmRun(['view', `${name}@${version}`, '--json'], root);
					const value = JSON.parse(stdout);
					const manifests = Array.isArray(value) ? value : [value];
					assert.equal(manifests.length, 1, `Expected one registry manifest for ${name}`);
					assert.equal(manifests[0].name, name);
					assert.equal(manifests[0].version, version);
					releasedCatalog.set(name, { root: `${name}@${version}`, manifest: manifests[0] });
				}
				entry = releasedCatalog.get(name);
			}
			assert.ok(
				semver.satisfies(entry.manifest.version, range),
				`${name}@${entry.manifest.version} does not satisfy ${range}`
			);
			if (selected.has(name)) return;
			selected.add(name);
			for (const [dependency, requested] of Object.entries({
				...entry.manifest.dependencies,
				...entry.manifest.optionalDependencies,
				...entry.manifest.peerDependencies
			}))
				await visit(dependency, requested);
			if (!packed.has(name)) {
				const { stdout } = await npmRun(
					[
						'pack',
						...(Object.hasOwn(released, name) ? [entry.root] : []),
						'--json',
						'--ignore-scripts',
						'--pack-destination',
						artifacts
					],
					Object.hasOwn(released, name) ? root : entry.root
				);
				const inventory = parseNpmPackOutput(stdout, name);
				assert.equal(path.basename(inventory.filename), inventory.filename);
				packed.set(name, `file:${path.join(artifacts, inventory.filename)}`);
			}
		};
		for (const [name, range] of Object.entries({
			...manifest.dependencies,
			...manifest.devDependencies
		}))
			await visit(name, range);
		manifest.overrides = Object.fromEntries([...selected].map((name) => [name, packed.get(name)]));
		for (const section of ['dependencies', 'devDependencies']) {
			for (const name of Object.keys(manifest[section] ?? {})) {
				if (packed.has(name)) manifest[section][name] = packed.get(name);
			}
		}
		await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
		await npmRun(['install', '--no-audit', '--no-fund'], root);
		for (const [name, version] of Object.entries(released)) {
			assert.ok(selected.has(name), `Unused released-package pin: ${name}`);
			const installed = JSON.parse(
				await readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8')
			);
			assert.equal(installed.version, version, `Installed release pin for ${name}`);
		}
		console.log(
			`Installed candidate dependencies for ${manifest.name}, registry pins: ${JSON.stringify(released)}`
		);
	};
}
