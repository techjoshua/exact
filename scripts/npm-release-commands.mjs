import { selectReleaseWorkspaces } from './package-release-selection.mjs';

/** The GitHub workflow permitted to submit releases for human approval in npm. */
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

/** Creates stage-only trust; never grants direct publication or approves an npm stage. */
export function npmTrustArguments(name) {
	return [
		'trust',
		'github',
		name,
		`--repo=${npmTrustTarget.repository}`,
		`--file=${npmTrustTarget.file}`,
		'--allow-stage-publish',
		'--no-allow-publish',
		'--yes',
		'--registry=https://registry.npmjs.org/'
	];
}

/** Builds an archive submission command. Staging never falls back to direct publishing. */
export function npmSubmissionArguments(archive, version, stage) {
	return [
		...(stage ? ['stage', 'publish'] : ['publish']),
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
 * Preserves unrelated publishers, skips an exact stage-only match, and refuses to silently
 * accept or replace a matching trust with direct-publish or unknown permissions.
 */
export function needsNpmTrust(configurations) {
	const matches = configurations.filter(
		(value) =>
			value.type === 'github' &&
			value.repository === npmTrustTarget.repository &&
			value.file === npmTrustTarget.file
	);
	for (const value of matches) {
		if (
			value.environment ||
			!Array.isArray(value.permissions) ||
			value.permissions.length !== 1 ||
			value.permissions[0] !== 'createStagedPackage'
		)
			throw new Error(
				`Review conflicting npm trust ${value.id}: require no environment and only stage publishing. Remove it in npm before rerunning.`
			);
	}
	return matches.length === 0;
}
