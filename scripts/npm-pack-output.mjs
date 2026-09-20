/**
 * Reads one workspace's npm pack inventory from the npm 11 array or npm 12 name-keyed map.
 * Rejects missing, ambiguous, or malformed inventories rather than skipping package checks.
 * This helper requires no workspace builds or external dependencies.
 */
export function parseNpmPackOutput(output, name) {
	const value = JSON.parse(output);
	const invalid = () => new Error(`Invalid npm pack response for ${name}`);
	let pack;
	if (Array.isArray(value)) {
		if (value.length !== 1) throw invalid();
		pack = value[0];
	} else {
		if (!value || typeof value !== 'object') throw invalid();
		const keys = Object.keys(value);
		if (keys.length !== 1 || keys[0] !== name) throw invalid();
		pack = value[name];
	}
	if (
		!pack ||
		pack.name !== name ||
		!Array.isArray(pack.files) ||
		pack.files.length === 0 ||
		!pack.files.every((file) => file && typeof file.path === 'string' && file.path.length > 0) ||
		pack.entryCount !== pack.files.length
	)
		throw invalid();
	return pack;
}
