import { selectReleaseWorkspaces } from './package-release-selection.mjs';

/** The GitHub workflow permitted to publish validated release archives directly to npm. */
export const npmTrustTarget = Object.freeze({
	repository: 'techjoshua/exact',
	file: 'native-compiler-packages.yml'
});

/** Selects release identities, including native targets whenever their compiler host is selected. */
export function selectNpmReleasePackages(entries, names) {
	const selected = selectReleaseWorkspaces(entries, names);
	const compiler = selected.find((entry) => entry.manifest.name === '@exactjs/compiler');
	if (compiler) {
		for (const entry of entries) {
			if (
				/^native\/npm\/[^/]+\/package\.json$/.test(entry.relativePath) &&
				entry.manifest.exactNativeTarget
			)
				selected.push({
					...entry,
					manifest: { ...entry.manifest, version: compiler.manifest.version }
				});
		}
	}
	return selected;
}

/** Creates direct-publish trust for the release workflow without staging permission. */
export function npmTrustArguments(name) {
	return [
		'trust',
		'github',
		name,
		`--repo=${npmTrustTarget.repository}`,
		`--file=${npmTrustTarget.file}`,
		'--allow-publish',
		'--no-allow-stage-publish',
		'--yes',
		'--registry=https://registry.npmjs.org/'
	];
}

/** Builds a direct publication command for a validated archive and its release tag. */
export function npmSubmissionArguments(archive, version) {
	return [
		'publish',
		archive,
		'--access=public',
		`--tag=${version.includes('-') ? 'next' : 'latest'}`,
		'--registry=https://registry.npmjs.org/'
	];
}

/**
 * Decodes npm trust list's sequence of pretty-printed JSON objects (one per publisher).
 * Empty output means no trusts. Malformed output fails closed rather than authorizing a mutation.
 */
export function parseNpmTrustOutput(output) {
	const values = [];
	let start = -1;
	let depth = 0;
	let quoted = false;
	let escaped = false;
	for (let index = 0; index < output.length; index++) {
		const char = output[index];
		if (start === -1) {
			if (/\s/.test(char)) continue;
			if (char !== '{') throw new Error('Invalid npm trust response');
			start = index;
		}
		if (quoted) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') quoted = false;
		} else if (char === '"') quoted = true;
		else if (char === '{' || char === '[') depth++;
		else if (char === '}' || char === ']') {
			depth--;
			if (depth === 0) {
				const value = JSON.parse(output.slice(start, index + 1));
				if (typeof value.id !== 'string' || typeof value.type !== 'string')
					throw new Error('Invalid npm trust response');
				values.push(value);
				start = -1;
			}
		}
	}
	if (start !== -1) throw new Error('Incomplete npm trust response');
	return values;
}

/**
 * Plans direct-publish trust setup or migration of this workflow's known staging grant.
 * Refuses unrelated publishers, environment restrictions, duplicates, and unknown permissions.
 * npm allows only one publisher per package; replacement revokes only the verified matching ID.
 */
export function planNpmTrust(configurations) {
	if (!configurations.length) return { create: true };
	if (configurations.length !== 1) throw new Error('Review conflicting npm trusts before setup.');
	const value = configurations[0];
	if (
		value.type !== 'github' ||
		value.repository !== npmTrustTarget.repository ||
		value.file !== npmTrustTarget.file ||
		value.environment ||
		!Array.isArray(value.permissions) ||
		!value.permissions.length ||
		new Set(value.permissions).size !== value.permissions.length ||
		value.permissions.some(
			(permission) => !['createPackage', 'createStagedPackage'].includes(permission)
		)
	)
		throw new Error(
			`Review conflicting npm trust ${value.id}: unexpected publisher or permissions.`
		);
	if (value.permissions.length === 1 && value.permissions[0] === 'createPackage')
		return { create: false };
	return { create: true, revokeId: value.id };
}

/** Removes only a preflight-verified publisher before recreating its direct-publish grant. */
export function npmTrustRevokeArguments(name, id) {
	return ['trust', 'revoke', name, `--id=${id}`, '--yes', '--registry=https://registry.npmjs.org/'];
}

/** Accepts npm view's scalar or singleton-array string field without accepting ambiguous results. */
export function parseNpmRegistryString(output) {
	const parsed = JSON.parse(output);
	const value = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed;
	if (typeof value !== 'string' || !value.length)
		throw new Error('Expected one npm registry string value');
	return value;
}
