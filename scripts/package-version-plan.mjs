import semver from 'semver';
import { isPublishableWorkspace } from './workspace-manifests.mjs';

/** Dependency sections rewritten only when their existing range excludes a selected release. */
export const releaseDependencySections = Object.freeze([
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies'
]);

/**
 * Plans independent package versions without mutating input manifests.
 * Public dependents whose ranges must change require explicit selection, so their published
 * manifests never change silently under an existing version. Native templates follow the compiler.
 */
export function planPackageVersions(entries, version, names) {
	if (semver.valid(version) !== version || version === '0.0.0')
		throw new Error('Provide a canonical, non-placeholder semver release version.');
	const publicEntries = entries.filter(isPublishableWorkspace);
	const available = new Set(publicEntries.map((entry) => entry.manifest.name));
	const selected = new Set(names ?? available);
	if (!selected.size) throw new Error('Select at least one public package.');
	for (const name of selected) {
		if (!available.has(name)) throw new Error(`Not a public npm workspace: ${name}`);
	}
	const releases = new Map([...selected].map((name) => [name, version]));
	if (selected.has('@exactjs/compiler')) {
		for (const entry of entries) {
			if (entry.relativePath.startsWith('native/npm/') && entry.manifest.exactNativeTarget)
				releases.set(entry.manifest.name, version);
		}
	}
	const changes = [];
	for (const entry of entries) {
		const manifest = structuredClone(entry.manifest);
		const next = releases.get(manifest.name);
		if (next) {
			if (semver.valid(manifest.version) && semver.lt(next, manifest.version))
				throw new Error(`Cannot downgrade ${manifest.name} from ${manifest.version} to ${next}`);
			manifest.version = next;
			manifest.publishConfig = { ...manifest.publishConfig, access: 'public' };
		}
		for (const section of releaseDependencySections) {
			for (const [name, range] of Object.entries(manifest[section] ?? {})) {
				const targetVersion = releases.get(name);
				const nativeCompiler =
					manifest.name === '@exactjs/compiler' && name.startsWith('@exactjs/compiler-native-');
				if (
					!targetVersion ||
					(nativeCompiler ? range === targetVersion : semver.satisfies(targetVersion, range))
				)
					continue;
				if (isPublishableWorkspace(entry) && !selected.has(manifest.name))
					throw new Error(
						`${manifest.name} must also be selected: ${section}.${name} (${range}) excludes ${targetVersion}`
					);
				manifest[section][name] = nativeCompiler ? targetVersion : `^${targetVersion}`;
			}
		}
		if (JSON.stringify(manifest) !== JSON.stringify(entry.manifest)) {
			if (isPublishableWorkspace(entry) && manifest.version === entry.manifest.version)
				throw new Error(`Manifest changes require a new version for ${manifest.name}`);
			changes.push({ ...entry, manifest });
		}
	}
	return { packages: [...selected].sort(), changes };
}
