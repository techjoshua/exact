import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Package fields consumed by the library build; other package metadata remains untouched. */
export interface LibraryManifest {
	name: string;
	version: string;
	exports?: unknown;
	files?: string[];
	exactComponentLibrary?: { protocol: number; build: string };
	exactCompileModules?: string[];
	exactTargetDirectories?: Record<string, string>;
	exactCompiledComponents?: string[] | Record<string, string[]>;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
}

/** Reads and validates the build plan before any output is replaced. */
export async function readLibraryManifest(root: string): Promise<LibraryManifest> {
	const manifest = JSON.parse(
		await readFile(path.join(root, 'package.json'), 'utf8')
	) as LibraryManifest & { type?: string };
	if (
		!manifest ||
		typeof manifest.name !== 'string' ||
		typeof manifest.version !== 'string' ||
		manifest.type !== 'module'
	)
		throw new Error('Library builds require a named, versioned ESM package (type: module)');
	if (
		manifest.files !== undefined &&
		(!Array.isArray(manifest.files) || !manifest.files.every((value) => typeof value === 'string'))
	)
		throw new Error('Library package files must be an array of strings');
	const targets = ['client', 'server'].map(
		(target) => manifest.exactTargetDirectories?.[target] ?? target
	);
	if (
		targets.some((value) => typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(value)) ||
		targets[0] === targets[1]
	)
		throw new Error('exactTargetDirectories must name two distinct directories inside dist');
	const declaration = manifest.exactComponentLibrary;
	if (declaration) {
		if (
			declaration.protocol !== 1 ||
			typeof declaration.build !== 'string' ||
			!manifest.exactCompiledComponents
		)
			throw new Error(
				'Component libraries require protocol-1 exactComponentLibrary.build and exactCompiledComponents'
			);
		const relative = path.relative(path.join(root, 'dist'), path.resolve(root, declaration.build));
		if (
			!relative ||
			relative.startsWith('..') ||
			path.isAbsolute(relative) ||
			targets.includes(relative.split(path.sep)[0]!)
		)
			throw new Error(
				'exactComponentLibrary.build must be a file inside dist, outside the target directories'
			);
	}
	const components = manifest.exactCompiledComponents;
	if (components !== undefined) {
		const groups = Array.isArray(components)
			? [components]
			: components && typeof components === 'object'
				? Object.values(components)
				: [];
		if (
			!groups.length ||
			!groups.every(
				(group) =>
					Array.isArray(group) && group.every((name) => typeof name === 'string' && name.length)
			)
		)
			throw new Error(
				'exactCompiledComponents must be an array or subpath-to-array map of export names'
			);
	}
	return manifest;
}
