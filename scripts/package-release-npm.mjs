import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { isPublishableWorkspace, readWorkspaceManifests } from './workspace-manifests.mjs';

const root = path.resolve(import.meta.dirname, '..');
const nativePackages = path.resolve(argument('native-packages'));
const output = path.resolve(argument('output'));
const npm = npmInvocation();

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const workspaces = (await readWorkspaceManifests(root)).filter(isPublishableWorkspace);
for (const workspace of workspaces) {
	await run(npm.command, [
		...npm.prefix,
		'pack',
		path.dirname(workspace.filename),
		'--pack-destination',
		output,
		'--silent'
	]);
}

const nativeArchives = (await readdir(nativePackages)).filter((entry) => entry.endsWith('.tgz'));
if (nativeArchives.length === 0) {
	throw new Error(`No native compiler packages found in ${nativePackages}`);
}
for (const archive of nativeArchives) {
	await cp(path.join(nativePackages, archive), path.join(output, archive));
}

const archives = (await readdir(output)).filter((entry) => entry.endsWith('.tgz'));
const expected = workspaces.length + nativeArchives.length;
if (archives.length !== expected) {
	throw new Error(`Packaged ${archives.length} npm archives; expected ${expected}`);
}

console.log(
	`Packaged ${workspaces.length} public workspaces and ${nativeArchives.length} native compiler packages in ${output}`
);

function argument(name) {
	const separate = process.argv.indexOf(`--${name}`);
	const value = separate === -1 ? undefined : process.argv[separate + 1];
	if (!value) throw new Error(`Pass --${name} <path>`);
	return value;
}

/** Resolves npm without assuming its executable name on Windows. */
function npmInvocation() {
	const cli = process.env.npm_execpath;
	if (cli) return { command: process.execPath, prefix: [cli] };
	if (process.platform !== 'win32') return { command: 'npm', prefix: [] };
	return {
		command: process.env.ComSpec ?? 'cmd.exe',
		prefix: ['/d', '/s', '/c', 'npm.cmd']
	};
}

function run(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: root,
			env: {
				...process.env,
				npm_config_cache: path.join(root, '.tmp', 'npm-cache')
			},
			stdio: 'inherit',
			windowsHide: true
		});
		child.once('error', reject);
		child.once('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${command} exited with ${code}`));
		});
	});
}
