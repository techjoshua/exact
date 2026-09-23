import path from 'node:path';

/** Returns JavaScript map sources unavailable from either embedded content or the npm file inventory. */
export function missingPackagedMapSources(mapPath, map, packedPaths) {
	if (!Array.isArray(map.sources) || !map.sources.every((source) => typeof source === 'string'))
		throw new TypeError(`Invalid source map sources: ${mapPath}`);
	return map.sources.filter((source, index) => {
		if (typeof map.sourcesContent?.[index] === 'string') return false;
		const target = path.posix.normalize(
			path.posix.join(path.posix.dirname(mapPath), map.sourceRoot ?? '', source)
		);
		return !packedPaths.has(target);
	});
}
