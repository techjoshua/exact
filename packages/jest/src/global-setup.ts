import {
	createCompilerSession,
	inspectExactComponentBuildFacts,
	resolveNativeCompilerExecutable,
	type ExactComponentBuildFacts
} from '@exactjs/compiler';
import {
	createExactComponentAuthorizationSession,
	recordExactNodeComponentProvenance
} from '@exactjs/component-library-policy';
import { loadExactConfig } from '@exactjs/config/node';
import { jsxSourceOwnership } from '@exactjs/react-compat/plugin';
import { usesReactRuntimeImports } from '@exactjs/react-compat/transform';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	exactJestAuthorizationCacheEnvironment,
	exactJestResolutionKey,
	type ExactJestAuthorizationCache
} from './authorization-cache.js';

type JestProjectConfig = Readonly<{
	rootDir: string;
	roots?: readonly string[];
	cacheDirectory?: string;
	id?: string;
}>;

/**
 * Preflights every authored Jest module and writes one immutable authorization generation.
 * Candidate implementations are resolved and validated as data but never imported.
 */
export default async function exactJestGlobalSetup(
	_globalConfig: unknown,
	projectConfig: JestProjectConfig
): Promise<void> {
	const projectRoot = path.resolve(projectConfig.rootDir);
	const loaded = await loadExactConfig({ applicationRoot: projectRoot });
	const files = await authoredModules(
		projectConfig.roots?.length ? projectConfig.roots : [projectRoot]
	);
	const sourceRecords = await Promise.all(
		files.map(async (filename) => ({ filename, source: await readFile(filename, 'utf8') }))
	);
	const sourceHashes = Object.fromEntries(
		sourceRecords.map(({ filename, source }) => [filename, sourceHash(source)])
	);
	const buildKey = `jest-${sourceHash(
		JSON.stringify({ projectRoot, id: projectConfig.id, sources: sourceHashes })
	)}`;
	const session = createExactComponentAuthorizationSession({
		buildKey,
		config: loaded.config?.componentLibraries
	});
	const compilerSession = createCompilerSession({
		nativeCompiler: { executable: resolveNativeCompilerExecutable() }
	});
	const resolutions: Record<string, string> = {};
	try {
		const componentGraph: ExactComponentBuildFacts[] = [];
		for (const { filename, source } of sourceRecords) {
			const ownership = jsxSourceOwnership(filename, source, undefined);
			if (
				ownership === 'react' ||
				(ownership === 'unknown' && usesReactRuntimeImports(source, filename))
			)
				continue;
			const facts = inspectExactComponentBuildFacts(source, {
				filename,
				target: 'server',
				serverComponents: true,
				session: compilerSession
			});
			session.recordImporterFacts(filename, facts, sourceHashes[filename]!);
			componentGraph.push(facts);
		}
		await authorizeComponentGraph(componentGraph, session, projectRoot, resolutions);
		const committed = await session.commitGeneration();
		const cache: ExactJestAuthorizationCache = Object.freeze({
			protocol: 1,
			projectRoot,
			sources: Object.freeze(sourceHashes),
			resolutions: Object.freeze(resolutions),
			manifest: committed.manifest,
			audit: committed.audit
		});
		const cacheDirectory = path.resolve(
			projectConfig.cacheDirectory ?? path.join(projectRoot, '.exact', 'jest')
		);
		await mkdir(cacheDirectory, { recursive: true });
		const cachePath = path.join(cacheDirectory, `component-authorization-${buildKey}.json`);
		await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, { flag: 'wx' });
		process.env[exactJestAuthorizationCacheEnvironment] = cachePath;
	} catch (error) {
		session.rejectGeneration();
		throw error;
	} finally {
		compilerSession.dispose();
		session.dispose();
	}
}

async function authorizeComponentGraph(
	pending: ExactComponentBuildFacts[],
	session: ReturnType<typeof createExactComponentAuthorizationSession>,
	projectRoot: string,
	resolutions: Record<string, string>
): Promise<void> {
	const visited = new Set<string>();
	while (pending.length) {
		const facts = pending.shift()!;
		const graphKey = `${facts.filename}\0${sourceHash(JSON.stringify(facts))}`;
		if (visited.has(graphKey)) continue;
		visited.add(graphKey);
		for (const edge of facts.componentImports) {
			if (!edge.artifactTargets.includes('server') || !externalPackageRequest(edge.moduleSpecifier))
				continue;
			const result = await authorizeJestCandidate({
				session,
				projectRoot,
				facts,
				moduleSpecifier: edge.moduleSpecifier,
				exportName: edge.exportName
			});
			if (!result.componentBuild)
				throw new Error(`Required Jest component ${edge.moduleSpecifier} was unexpectedly omitted`);
			resolutions[exactJestResolutionKey(path.dirname(facts.filename), edge.moduleSpecifier)] =
				result.resolvedModuleId;
			pending.push(result.componentBuild);
		}
		for (const enhancement of facts.rendererEnhancements) {
			if (!externalPackageRequest(enhancement.moduleSpecifier)) continue;
			const result = await authorizeJestCandidate({
				session,
				projectRoot,
				facts,
				moduleSpecifier: enhancement.moduleSpecifier,
				exportName: enhancement.exportName,
				optionalEnhancementIdentity: enhancement.identity
			});
			if (result.componentBuild) {
				resolutions[
					exactJestResolutionKey(path.dirname(facts.filename), enhancement.moduleSpecifier)
				] = result.resolvedModuleId;
				pending.push(result.componentBuild);
			}
		}
	}
}

async function authorizeJestCandidate(options: {
	session: ReturnType<typeof createExactComponentAuthorizationSession>;
	projectRoot: string;
	facts: ExactComponentBuildFacts;
	moduleSpecifier: string;
	exportName: string;
	optionalEnhancementIdentity?: string;
}): Promise<{ resolvedModuleId: string; componentBuild?: ExactComponentBuildFacts }> {
	const resolvedModuleId = createRequire(options.facts.filename).resolve(options.moduleSpecifier);
	const provenance = await recordExactNodeComponentProvenance({
		session: options.session,
		applicationRoot: options.projectRoot,
		importerModuleId: options.facts.filename,
		moduleSpecifier: options.moduleSpecifier,
		resolvedModuleId
	});
	const result = await options.session.authorizeResolvedComponent({
		importerModuleId: options.facts.filename,
		moduleSpecifier: options.moduleSpecifier,
		exportName: options.exportName,
		resolvedModuleId,
		packageInstanceKey: provenance.instance.key,
		reason: 'server-test',
		...(options.optionalEnhancementIdentity
			? { optionalEnhancementIdentity: options.optionalEnhancementIdentity }
			: {})
	});
	return {
		resolvedModuleId,
		...(result.outcome === 'authorized' ? { componentBuild: result.componentBuild } : {})
	};
}

async function authoredModules(roots: readonly string[]): Promise<string[]> {
	const result: string[] = [];
	const pending = roots.map((root) => path.resolve(root));
	while (pending.length) {
		const current = pending.pop()!;
		for (const entry of await readdir(current, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!['.exact', '.git', 'coverage', 'dist', 'node_modules'].includes(entry.name))
					pending.push(path.join(current, entry.name));
			} else if (/\.[cm]?[jt]sx$/i.test(entry.name)) {
				result.push(path.join(current, entry.name));
			}
		}
	}
	return result.sort();
}

function externalPackageRequest(specifier: string): boolean {
	return (
		!specifier.startsWith('.') && !path.isAbsolute(specifier) && !specifier.startsWith('node:')
	);
}

function sourceHash(source: string): string {
	return createHash('sha256').update(source).digest('base64url');
}
