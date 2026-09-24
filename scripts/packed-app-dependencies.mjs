import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';
import { parseNpmPackOutput } from './npm-pack-output.mjs';

const execute = promisify(execFile);

/** Packs the selected local dependency closure and installs it without workspace links or compiler overrides. */
export async function createPackedAppInstaller(workspace, temporary) {
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
			const entry = catalog.get(name);
			assert.ok(entry, `Missing candidate package ${name}`);
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
					['pack', '--json', '--ignore-scripts', '--pack-destination', artifacts],
					entry.root
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
		console.log(`Installed packed candidate dependencies for ${manifest.name}`);
	};
}
