import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { validateAbiRelease } from './abi-release-policy.mjs';
import { resolveReleaseRevision } from './release-revision.mjs';
import { readWorkspaceManifests } from './workspace-manifests.mjs';

const root = path.resolve(import.meta.dirname, '..');
const requestedBase =
	process.argv.find((value) => value.startsWith('--base='))?.slice(7) ??
	process.env.RELEASE_ABI_BASE ??
	'HEAD';
const policyPath = 'scripts/contracts/release-abi.json';
const contractPath = 'scripts/contracts/compiler-abi.json';
const policy = JSON.parse(await readFile(path.join(root, policyPath), 'utf8'));
const contract = JSON.parse(await readFile(path.join(root, contractPath), 'utf8'));
const entries = await readWorkspaceManifests(root);
const versions = new Map(entries.map((entry) => [entry.manifest.name, entry.manifest.version]));
// Verify the revision separately: a missing baseline is allowed only for the initial adoption.
const base = resolveReleaseRevision(root, requestedBase);
if (process.env.RELEASE_ABI_REQUIRE_PRIOR === 'true') {
	const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
	if (base === head)
		throw new Error(
			'Publication requires an explicit prior ABI revision, not the current commit. Set the workflow abi_base input.'
		);
}
const paths = execFileSync('git', ['ls-tree', '--name-only', base, '--', policyPath], {
	cwd: root,
	encoding: 'utf8'
});
if (!paths.trim()) {
	if (
		policy.epoch !== 1 ||
		policy.introduced !== '0.5.0' ||
		!Array.isArray(policy.providers) ||
		!policy.providers.length ||
		policy.providers.some((name) => versions.get(name) !== '0.5.0')
	)
		throw new Error('The initial ABI baseline must use epoch 1 and package version 0.5.0.');
	console.log('Initial public ABI baseline: epoch 1 at 0.5.0.');
} else {
	const previous = readGitJson(policyPath);
	const frozenPath = `fixtures/release-abi/${previous.introduced}/integrity.json`;
	const frozen = readGitJson(frozenPath);
	if (
		JSON.stringify(frozen) !==
		JSON.stringify(JSON.parse(await readFile(path.join(root, frozenPath), 'utf8')))
	)
		throw new Error('Previously published ABI fixtures must not be regenerated.');
	const previousVersions = new Map(
		previous.providers.map((name) => {
			const entry = entries.find((candidate) => candidate.manifest.name === name);
			if (!entry) throw new Error(`Missing ABI provider ${name}`);
			return [name, readGitJson(entry.relativePath).version];
		})
	);
	validateAbiRelease(
		previous,
		policy,
		readGitJson(contractPath),
		contract,
		previousVersions,
		versions
	);
	console.log(
		`ABI epoch ${policy.epoch} satisfies breaking-release version policy against ${base}.`
	);
}

function readGitJson(filename) {
	return JSON.parse(
		execFileSync('git', ['show', `${base}:${filename}`], { cwd: root, encoding: 'utf8' })
	);
}
