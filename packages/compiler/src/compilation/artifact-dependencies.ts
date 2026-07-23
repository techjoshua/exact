import type { ModuleRewriteOptions } from '@exactjs/expressions';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
	artifactPathsFor,
	commonRoot,
	isTransformablePath,
	slashPath,
	sortPlanEntries
} from '../paths.js';
import type { CompileArtifactsOptions, ExactArtifactPlanEntry } from '../types.js';
import { collectPlacementAnalysisDependencies } from './dependency-discovery.js';

/** Expands explicit entries through reachable modules that require JSX compilation. */
export async function expandArtifactPlanDependencies(
	entries: readonly ExactArtifactPlanEntry[],
	options: CompileArtifactsOptions
): Promise<ExactArtifactPlanEntry[]> {
	if (!entries.length) return [];
	const sources = new Map<string, string>();
	for (const entry of entries)
		sources.set(path.resolve(entry.inputFile), await readFile(entry.inputFile, 'utf8'));
	await collectPlacementAnalysisDependencies(sources, options.session);
	const rootDir = path.resolve(
		options.rootDir ?? commonRoot(entries.map((entry) => entry.inputFile))
	);
	const planned = new Map(entries.map((entry) => [artifactInputKey(entry.inputFile), entry]));
	for (const inputFile of sources.keys()) {
		const resolved = path.resolve(inputFile);
		const key = artifactInputKey(resolved);
		const relative = path.relative(rootDir, resolved);
		if (
			planned.has(key) ||
			!isTransformablePath(resolved) ||
			!/\.[cm]?[jt]sx$/i.test(resolved) ||
			relative.startsWith(`..${path.sep}`) ||
			path.isAbsolute(relative)
		)
			continue;
		planned.set(key, {
			inputFile: resolved,
			...artifactPathsFor(resolved, options.outDir, rootDir)
		});
	}
	return sortPlanEntries([...planned.values()]);
}

/** Creates target-specific aliases from authored local edges to emitted artifacts or sources. */
export function artifactModuleRewrite(
	entry: ExactArtifactPlanEntry,
	target: 'client' | 'server',
	entries: readonly ExactArtifactPlanEntry[],
	dependencies: readonly { specifier: string; file: string }[],
	configured?: ModuleRewriteOptions
): ModuleRewriteOptions | undefined {
	const outputFile = target === 'client' ? entry.clientFile : entry.serverFile;
	const artifactByInput = new Map(
		entries.map((candidate) => [artifactInputKey(candidate.inputFile), candidate])
	);
	const generatedAliases: Record<string, string> = {};
	for (const dependency of dependencies) {
		const artifact = artifactByInput.get(artifactInputKey(dependency.file));
		const destination = artifact
			? target === 'client'
				? artifact.clientFile
				: artifact.serverFile
			: dependency.file;
		generatedAliases[dependency.specifier] = runtimeImportPath(outputFile, destination);
	}
	if (!configured && !Object.keys(generatedAliases).length) return undefined;
	return {
		...configured,
		moduleAliases: { ...(configured?.moduleAliases ?? {}), ...generatedAliases }
	};
}

function runtimeImportPath(fromArtifact: string, destination: string): string {
	let relative = slashPath(path.relative(path.dirname(fromArtifact), destination)).replace(
		/\.(?:[cm]?[jt]sx?)$/i,
		'.js'
	);
	if (!relative.startsWith('.')) relative = `./${relative}`;
	return relative;
}

function artifactInputKey(filename: string): string {
	const resolved = slashPath(path.resolve(filename));
	return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
