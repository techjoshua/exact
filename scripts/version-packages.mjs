import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { readWorkspaceManifests } from './workspace-manifests.mjs';
import { planPackageVersions } from './package-version-plan.mjs';
import { compilerAbiOutputs } from './compiler-abi-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const version = argument('version') ?? process.argv[2];
const packages = argument('packages')?.split(',');
const plan = planPackageVersions(await readWorkspaceManifests(root), version, packages);
console.log(
	JSON.stringify(
		{ version, packages: plan.packages, files: plan.changes.map((entry) => entry.relativePath) },
		null,
		2
	)
);
if (!process.argv.includes('--dry-run')) {
	for (const entry of plan.changes)
		await writeFile(entry.filename, `${JSON.stringify(entry.manifest, null, '\t')}\n`);
	for (const [filename, contents] of await compilerAbiOutputs(root))
		await writeFile(filename, contents);
	console.log('Run npm install --package-lock-only --ignore-scripts to refresh package-lock.json.');
}

function argument(name) {
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
