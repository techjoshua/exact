import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
	ExactComponentBuildFacts,
	ExactPublishedComponentBuildFacts
} from './contracts/transform.js';

/** Declarative package inputs used to produce inert component-library build facts. */
export type ExactComponentLibraryBuildInput = Readonly<{
	package: Readonly<{ name: string; version: string }>;
	modules: readonly Readonly<{
		path: string;
		facts: ExactComponentBuildFacts | Omit<ExactComponentBuildFacts, 'filename' | 'packageName'>;
	}>[];
	exports: ExactPublishedComponentBuildFacts['exports'];
}>;

/** Creates deterministic protocol-1 static facts without adding trust decisions. */
export function createExactPublishedComponentBuildFacts(
	input: ExactComponentLibraryBuildInput
): ExactPublishedComponentBuildFacts {
	if (!input.package.name || !input.package.version)
		throw new Error('Published component build facts require a package name and version');
	const modules = input.modules
		.map((module) => {
			const modulePath = normalizePackagePath(module.path);
			const facts = module.facts as ExactComponentBuildFacts;
			if (facts.protocol !== 1)
				throw new Error(`Component build facts for ${modulePath} use an unsupported protocol`);
			return Object.freeze({
				path: modulePath,
				facts: Object.freeze({
					protocol: 1 as const,
					components: Object.freeze([...facts.components]),
					componentImports: Object.freeze([...facts.componentImports]),
					rendererEnhancements: Object.freeze([...facts.rendererEnhancements])
				})
			});
		})
		.sort((left, right) => left.path.localeCompare(right.path));
	if (new Set(modules.map((module) => module.path)).size !== modules.length)
		throw new Error('Published component build facts contain duplicate module paths');
	const exports = input.exports
		.map((record) =>
			Object.freeze({
				...record,
				module: normalizePackagePath(record.module)
			})
		)
		.sort((left, right) =>
			[left.subpath, left.condition, left.exportName, left.componentId].join('\0').localeCompare(
				[right.subpath, right.condition, right.exportName, right.componentId].join('\0')
			)
		);
	const moduleComponents = new Map(
		modules.map((module) => [
			module.path,
			new Set(module.facts.components.map((component) => component.id))
		])
	);
	for (const record of exports)
		if (!moduleComponents.get(record.module)?.has(record.componentId))
			throw new Error(
				`Published export ${record.subpath}#${record.exportName} has no ${record.componentId} component in ${record.module}`
			);
	return Object.freeze({
		protocol: 1,
		package: Object.freeze({ ...input.package }),
		modules: Object.freeze(modules),
		exports: Object.freeze(exports)
	});
}

/** Writes deterministic static facts to a package-relative JSON file. */
export async function writeExactPublishedComponentBuildFacts(
	packageRoot: string,
	outputPath: string,
	input: ExactComponentLibraryBuildInput
): Promise<ExactPublishedComponentBuildFacts> {
	const root = path.resolve(packageRoot);
	const output = path.resolve(root, outputPath);
	const relative = path.relative(root, output);
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
		throw new Error('Component build-facts output must remain inside the package root');
	const facts = createExactPublishedComponentBuildFacts(input);
	await mkdir(path.dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(facts, null, 2)}\n`);
	return facts;
}

function normalizePackagePath(value: string): string {
	const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
	if (
		!normalized ||
		normalized.startsWith('/') ||
		normalized.split('/').every(Boolean) === false ||
		normalized.split('/').some((segment) => segment === '.' || segment === '..')
	)
		throw new Error(`Invalid package-relative component module path: ${value}`);
	return normalized;
}
