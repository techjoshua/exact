import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';
import semver from 'semver';
import { readWorkspaceManifests } from './workspace-manifests.mjs';
import {
	selectNpmReleasePackages,
	npmTrustArguments,
	parseNpmTrustOutput,
	needsNpmTrust
} from './npm-release-commands.mjs';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--execute' && !arg.startsWith('--packages=')))
	throw new Error('Usage: npm run release:trust -- [--packages=@exactjs/forms] [--execute]');
const names = args
	.find((arg) => arg.startsWith('--packages='))
	?.slice('--packages='.length)
	.split(',');
const selected = selectNpmReleasePackages(
	await readWorkspaceManifests(path.resolve(import.meta.dirname, '..')),
	names
);
const commands = selected.map(({ manifest }) => npmTrustArguments(manifest.name));
for (const command of commands) console.log(`npm ${command.join(' ')}`);
if (!args.includes('--execute')) {
	console.log(
		`Preview: ${commands.length} packages. Add --execute after npm login to configure stage-only trust.`
	);
} else {
	const npmCli = process.env.npm_execpath;
	if (!npmCli) throw new Error('Run through npm run release:trust so the npm CLI is known.');
	const run = (args, capture = false) =>
		execFileSync(process.execPath, [npmCli, ...args], {
			encoding: 'utf8',
			windowsHide: true,
			stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit'
		});
	if (!semver.satisfies(run(['--version'], true).trim(), '>=11.19.1'))
		throw new Error('Install npm 11.19.1 or newer for stage-only trust configuration.');
	// npm cannot open its web-auth flow when stdout is captured. Establish the trust
	// management session with an interactive read before collecting JSON for preflight.
	if (commands.length)
		run(['trust', 'list', commands[0][2], '--registry=https://registry.npmjs.org/']);
	// Check the entire selection before changing any remote trust settings. Missing packages
	// must be bootstrapped interactively; registry and authentication failures are not skipped.
	const pending = [];
	for (const command of commands) {
		const name = command[2];
		if (
			JSON.parse(
				run(['view', name, 'name', '--json', '--registry=https://registry.npmjs.org/'], true)
			) !== name
		)
			throw new Error(`Unexpected registry identity for ${name}`);
		const trusts = parseNpmTrustOutput(
			run(['trust', 'list', name, '--json', '--registry=https://registry.npmjs.org/'], true)
		);
		if (needsNpmTrust(trusts)) pending.push(command);
		else console.log(`Already configured: ${name}`);
	}
	for (const [index, command] of pending.entries()) {
		if (index) await setTimeout(2000);
		run(command);
	}
	console.log(`Configured ${pending.length} packages for stage-only publishing.`);
}
