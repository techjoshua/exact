import {
	exactConfigSearchPaths,
	findExactConfig,
	loadExactPackageEnhancements
} from '@exactjs/config/node';
import type { ExactPackageEnhancementImport } from '@exactjs/config';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Finds the nearest package boundary, retaining package-wide bindings only for their library owner. */
function sourcePackageRoot(
	filename: string
): Readonly<{ root: string; library: boolean }> | undefined {
	let directory = path.dirname(path.resolve(filename));
	while (true) {
		const manifest = path.join(directory, 'package.json');
		if (existsSync(manifest)) {
			const value = JSON.parse(readFileSync(manifest, 'utf8')) as {
				dependencies?: Record<string, unknown>;
			};
			return {
				root: directory,
				library: Boolean(value.dependencies?.['@exactjs/component-library'])
			};
		}
		const parent = path.dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

/** Reads library declarations statically. Consumer configuration cannot supply a library's lexical namespace. */
export function sourcePackageEnhancements(
	filename: string,
	configured: readonly ExactPackageEnhancementImport[] | undefined,
	applicationRoot?: string
): readonly ExactPackageEnhancementImport[] | undefined {
	const owner = sourcePackageRoot(filename);
	if (!owner) return configured;
	const applicationOwner = applicationRoot
		? (sourcePackageRoot(path.join(applicationRoot, '__exact_owner__.tsx'))?.root ??
			path.resolve(applicationRoot))
		: undefined;
	if (owner.root === applicationOwner) return configured;
	const configPath = findExactConfig(owner.root, owner.root);
	if (!configPath) return owner.library || applicationOwner ? [] : configured;
	return loadExactPackageEnhancements({ applicationRoot: owner.root, configPath })
		.packageEnhancements;
}

/** Includes absent config candidates so library configuration creation and removal invalidate consumers. */
export function sourcePackageEnhancementWatchFiles(filename: string): readonly string[] {
	const owner = sourcePackageRoot(filename);
	return owner ? exactConfigSearchPaths(owner.root, owner.root) : [];
}
