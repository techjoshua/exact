import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { readWorkspaceManifests } from './workspace-manifests.mjs';
import { selectReleaseWorkspaces } from './package-release-selection.mjs';
import { planNpmPublication } from './npm-publication-plan.mjs';

const root = path.resolve(import.meta.dirname, '..');
const directory = path.resolve(argument('directory') ?? '.tmp/release/npm');
const names = argument('packages')?.split(',');
const entries = await readWorkspaceManifests(root);
const selected = selectReleaseWorkspaces(entries, names);
const expected = new Map(selected.map((entry) => [entry.manifest.name, entry.manifest.version]));
if (expected.has('@exactjs/compiler')) {
	for (const entry of entries) {
		if (entry.relativePath.startsWith('native/npm/') && entry.manifest.exactNativeTarget)
			expected.set(entry.manifest.name, expected.get('@exactjs/compiler'));
	}
}
const archives = new Map();
for (const filename of await readdir(directory)) {
	if (!filename.endsWith('.tgz')) continue;
	const archive = path.join(directory, filename);
	const manifest = JSON.parse(
		execFileSync('tar', ['-xOf', archive, 'package/package.json'], {
			encoding: 'utf8',
			windowsHide: true
		})
	);
	if (!expected.has(manifest.name)) continue;
	if (
		manifest.private ||
		manifest.version !== expected.get(manifest.name) ||
		archives.has(manifest.name)
	)
		throw new Error(`Invalid or duplicate release archive: ${filename}`);
	archives.set(manifest.name, { archive, manifest });
}
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run through npm run release:publish so the npm CLI is known.');
// Finish artifact and registry preflight before the first externally visible publication.
const pending = await planNpmPublication(
	expected,
	archives,
	(name, version) => {
		try {
			const response = execFileSync(
				process.execPath,
				[npmCli, 'view', `${name}@${version}`, 'version', '--json'],
				{
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'pipe'],
					windowsHide: true
				}
			);
			if (JSON.parse(response) !== version)
				throw new Error(`Unexpected registry response for ${name}@${version}`);
			console.log(`Already published: ${name}@${version}`);
			return true;
		} catch (error) {
			let code;
			try {
				code = JSON.parse(String(error.stdout)).error?.code;
			} catch {
				/* A non-JSON failure is never evidence of an unpublished version. */
			}
			if (code !== 'E404') throw error;
			return false;
		}
	},
	(name) => {
		try {
			const response = execFileSync(
				process.execPath,
				[npmCli, 'view', name, 'versions', '--json'],
				{
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'pipe'],
					windowsHide: true
				}
			);
			const versions = JSON.parse(response);
			return typeof versions === 'string' ? [versions] : versions;
		} catch (error) {
			let code;
			try {
				code = JSON.parse(String(error.stdout)).error?.code;
			} catch {
				/* Fail closed below. */
			}
			if (code !== 'E404') throw error;
			return [];
		}
	}
);
console.log(
	JSON.stringify(
		{ publish: pending.map(({ manifest }) => `${manifest.name}@${manifest.version}`) },
		null,
		2
	)
);
if (process.argv.includes('--execute')) {
	for (const { archive, manifest } of pending) {
		const tag = manifest.version.includes('-') ? 'next' : 'latest';
		execFileSync(
			process.execPath,
			[npmCli, 'publish', archive, '--access=public', `--tag=${tag}`],
			{ stdio: 'inherit', windowsHide: true }
		);
	}
}

function argument(name) {
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
