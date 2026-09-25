import path from 'node:path';
import type {
	ExactComponentBuildFacts,
	ExactPublishedComponentBuildFacts
} from '../contracts/transform.js';
import type { LibraryManifest } from './manifest.js';
import { writeExactPublishedComponentBuildFacts } from '../component-library-build.js';
import { inspectLibraryExports } from './export-inspection.js';

/** Validates freshly emitted paired exports, then publishes their deterministic compiler facts. */
export async function publishLibraryFacts(
	packageRoot: string,
	manifest: LibraryManifest,
	componentBuildModules: ReadonlyMap<string, ExactComponentBuildFacts>
): Promise<void> {
	const componentBuildExports: ExactPublishedComponentBuildFacts['exports'][number][] = [];
	for (const target of ['client', 'server'])
		await verifyCompiledExports(target, manifest.exactTargetDirectories?.[target] ?? target);
	await writeComponentLibraryBuildFacts();
	async function verifyCompiledExports(target: string, targetDirectory: string) {
		const expected = normalizedCompiledComponents();
		for (const [subpath, names] of Object.entries(expected)) {
			if (!names.length) continue;
			const candidates = compiledExportTargets(subpath, targetDirectory);
			if (!candidates.length)
				throw new Error(`${manifest.name} has no ${target} artifact export for ${subpath}`);
			for (const candidate of candidates) {
				const entry = path.resolve(packageRoot, candidate.path);
				const relative = path.relative(path.join(packageRoot, 'dist', targetDirectory), entry);
				if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
					throw new Error(`Library export escapes its target directory: ${candidate.path}`);
				const namespace = await inspectLibraryExports(entry, names, target);
				const modulePath = packageModulePath(entry);
				for (const name of names) {
					const identity = namespace[name]!;
					const componentModule = componentModuleFor(identity, targetDirectory, subpath, name);
					if (manifest.exactComponentLibrary)
						componentBuildExports.push({
							subpath,
							condition: candidate.condition,
							module: modulePath,
							componentModule,
							exportName: name,
							componentId: identity
						});
				}
			}
		}
	}

	function componentModuleFor(
		identity: string,
		targetDirectory: string,
		subpath: string,
		exportName: string
	) {
		const prefix = `dist/${targetDirectory}/`;
		const candidates = [...componentBuildModules]
			.filter(
				([modulePath, facts]) =>
					modulePath.startsWith(prefix) &&
					facts.components.some((component) => component.id === identity)
			)
			.map(([modulePath]) => modulePath);
		if (candidates.length !== 1)
			throw new Error(
				`${manifest.name} ${subpath}:${exportName} must have exactly one target-local compiler owner; found ${candidates.length}`
			);
		return candidates[0]!;
	}

	async function writeComponentLibraryBuildFacts() {
		const declaration = manifest.exactComponentLibrary;
		if (!declaration) return;
		if (declaration.protocol !== 1 || typeof declaration.build !== 'string')
			throw new Error(`${manifest.name} must declare protocol-1 exactComponentLibrary.build`);
		if (!manifest.exactCompiledComponents)
			throw new Error(`${manifest.name} component libraries must declare exactCompiledComponents`);
		await writeExactPublishedComponentBuildFacts(packageRoot, declaration.build, {
			package: { name: manifest.name, version: manifest.version },
			modules: [...componentBuildModules]
				.filter(
					([, facts]) =>
						facts.components.length ||
						facts.componentImports.length ||
						facts.rendererEnhancements.length
				)
				.map(([modulePath, facts]) => ({ path: modulePath, facts })),
			exports: componentBuildExports
		});
	}

	function compiledExportTargets(subpath: string, targetDirectory: string) {
		const declaration = normalizeExports(manifest.exports)[subpath];
		const prefix = `dist/${targetDirectory}/`;
		return exportTargets(declaration).filter((candidate) => {
			const modulePath = normalizePath(candidate.path);
			return modulePath.startsWith(prefix) && /\.m?js$/.test(modulePath);
		});
	}

	function normalizedCompiledComponents(): Record<string, string[]> {
		const declaration = manifest.exactCompiledComponents ?? [];
		if (Array.isArray(declaration)) return { '.': declaration };
		if (
			declaration &&
			typeof declaration === 'object' &&
			Object.values(declaration).every(Array.isArray)
		)
			return declaration;
		throw new TypeError('exactCompiledComponents must be an array or subpath-to-array map');
	}

	function normalizeExports(value: LibraryManifest['exports']): Record<string, unknown> {
		if (typeof value === 'string' || Array.isArray(value) || !value) return { '.': value };
		return Object.keys(value as object).some((key) => key.startsWith('.'))
			? (value as Record<string, unknown>)
			: { '.': value };
	}

	function exportTargets(
		value: unknown,
		inheritedCondition = 'default'
	): { path: string; condition: string }[] {
		if (typeof value === 'string') return [{ condition: inheritedCondition, path: value }];
		if (Array.isArray(value))
			return value.flatMap((entry) => exportTargets(entry, inheritedCondition));
		if (!value || typeof value !== 'object') return [];
		return Object.entries(value).flatMap(([condition, entry]) => exportTargets(entry, condition));
	}

	function packageModulePath(filename: string) {
		return normalizePath(path.relative(packageRoot, filename));
	}

	function normalizePath(value: string) {
		return value.replaceAll('\\', '/').replace(/^\.\//, '');
	}
}
