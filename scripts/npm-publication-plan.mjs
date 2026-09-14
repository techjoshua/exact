import semver from 'semver';

/**
 * Preflights every selected archive and registry version before allowing publication.
 * The registry callback returns true only for an existing version, false only for E404,
 * and throws on authentication, network, or malformed responses.
 * Internal runtime, optional, and peer ranges must resolve from this selection or the
 * publishedVersions callback's registry version array. Development dependencies are not installed
 * for consumers. All dependency lookups finish before the caller receives a publication plan.
 */
export async function planNpmPublication(expected, archives, isPublished, publishedVersions) {
	for (const [name, version] of expected) {
		const entry = archives.get(name);
		if (
			!entry ||
			entry.manifest.private ||
			entry.manifest.name !== name ||
			entry.manifest.version !== version
		)
			throw new Error(`Missing or invalid release archive for ${name}@${version}`);
	}
	const pending = [];
	for (const [name, version] of expected) {
		if (!(await isPublished(name, version))) pending.push(archives.get(name));
	}
	const registry = new Map();
	for (const { manifest } of pending) {
		for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
			for (const [name, range] of Object.entries(manifest[section] ?? {})) {
				if (!name.startsWith('@exactjs/')) continue;
				if (!semver.validRange(range))
					throw new Error(`${manifest.name}: invalid ${section}.${name} range`);
				if (expected.has(name) && semver.satisfies(expected.get(name), range)) continue;
				if (!publishedVersions) throw new Error(`Registry dependency lookup required for ${name}`);
				if (!registry.has(name)) registry.set(name, await publishedVersions(name));
				const available = registry.get(name);
				if (!Array.isArray(available) || available.some((version) => !semver.valid(version)))
					throw new Error(`Invalid registry versions for ${name}`);
				if (!available.some((version) => semver.satisfies(version, range)))
					throw new Error(
						`${manifest.name}: ${section}.${name} (${range}) is neither published nor selected`
					);
			}
		}
	}
	return pending.sort(
		(left, right) =>
			Number(right.manifest.name.startsWith('@exactjs/compiler-native-')) -
			Number(left.manifest.name.startsWith('@exactjs/compiler-native-'))
	);
}
