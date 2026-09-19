import semver from 'semver';

/**
 * Rejects incompatible compiler/runtime contract changes without a new ABI epoch and package
 * breaking-release versions (minor at 0.x, major at 1.0 and later). Capability additions preserve
 * older artifacts; removals and reassignment do not.
 * Semantic changes with unchanged schemas must be classified by review and frozen artifact tests.
 */
export function validateAbiRelease(
	previous,
	current,
	previousContract,
	currentContract,
	previousVersions,
	currentVersions
) {
	if (
		!semver.valid(current.introduced) ||
		!Array.isArray(current.providers) ||
		!current.providers.length
	)
		throw new Error('ABI policy requires a baseline version and nonempty provider list.');
	if (current.epoch === previous.epoch && current.introduced !== previous.introduced)
		throw new Error('An unchanged ABI epoch must retain its original fixture baseline.');
	if (!Number.isSafeInteger(current.epoch) || current.epoch < previous.epoch)
		throw new Error('ABI epochs must be positive, monotonic integers.');
	if (previous.providers.some((name) => !current.providers.includes(name)))
		throw new Error('ABI providers cannot be removed from the compatibility gate.');
	const incompatible =
		Object.entries(previousContract.versions).some(
			([name, value]) => name !== 'compilerProcess' && currentContract.versions[name] !== value
		) ||
		Object.entries(previousContract.component).some(
			([name, value]) => currentContract.component[name] !== value
		);
	if (incompatible && current.epoch === previous.epoch)
		throw new Error('Incompatible contract changes require a new ABI epoch.');
	if (current.epoch > previous.epoch) {
		for (const name of previous.providers) {
			const before = previousVersions.get(name);
			const after = currentVersions.get(name);
			if (
				!semver.valid(before) ||
				!semver.valid(after) ||
				!(
					semver.major(after) > semver.major(before) ||
					(semver.major(before) === 0 &&
						semver.major(after) === 0 &&
						semver.minor(after) > semver.minor(before))
				)
			)
				throw new Error(
					`${name} requires a minor version increase at 0.x or a major version increase at 1.0 and later for ABI epoch ${current.epoch}.`
				);
		}
	}
}
