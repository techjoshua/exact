import {
	compileProjectArtifacts,
	createExactArtifactGraph,
	type ExactArtifactGraph
} from '@exactjs/compiler';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createExactRemoteArtifactPlan, resolveExactBuildKey } from './build.js';
import { generateExactClientBindingsBootstrap } from './artifacts.js';
import type { ExactMicrofrontendConfig } from './config.js';
import type { ExactMicrofrontendBuildConfig } from './plugin-config.js';

/** Retains the shared exposure plan and optional compiler graph prepared for one bundler build. */
export type ExactPreparedRemoteArtifactBuild = {
	plan: ReturnType<typeof createExactRemoteArtifactPlan>;
	artifactGraph?: ExactArtifactGraph;
	hasRemoteBindings: boolean;
};

/** Prepares the common artifact plan and compiler graph used by bundler adapters. */
export async function prepareExactRemoteArtifactBuild(options: {
	applicationRoot: string;
	buildConfig: ExactMicrofrontendBuildConfig;
	serverComponents?: boolean;
	buildKey?: string;
}): Promise<ExactPreparedRemoteArtifactBuild> {
	const applicationRoot = path.resolve(options.applicationRoot);
	const packageName = await applicationPackageName(applicationRoot);
	const config: ExactMicrofrontendConfig = {
		exposes: Object.fromEntries(options.buildConfig.exposes),
		remotes: {},
		providedPackages: [...options.buildConfig.providedPackages]
	};
	const basePlan = createExactRemoteArtifactPlan(config, {
		packageName,
		buildKey: resolveExactBuildKey({ buildKey: options.buildKey, cwd: applicationRoot })
	});
	const plan = Object.freeze({
		...basePlan,
		providedBootstrapSource: `${basePlan.providedBootstrapSource}${generateExactClientBindingsBootstrap(
			options.buildConfig.remoteBindings,
			{ applicationRoot }
		)}`
	});
	if (!plan.exposures.length)
		return Object.freeze({
			plan,
			hasRemoteBindings: options.buildConfig.remoteBindings.length > 0
		});

	const exposureFiles = plan.exposures.map((exposure) =>
		path.resolve(applicationRoot, exposure.component)
	);
	const inputs = exactProjectInputs(applicationRoot, exposureFiles);
	const temporaryOutput = await mkdtemp(path.join(tmpdir(), 'exact-remote-artifacts-'));
	try {
		const results = await compileProjectArtifacts(inputs, {
			outDir: temporaryOutput,
			rootDir: applicationRoot,
			serverComponents: options.serverComponents,
		});
		const graph = createExactArtifactGraph(results, {
			packageRoot: applicationRoot,
			sourceRoot: applicationRoot,
			rootDir: applicationRoot
		});
		return Object.freeze({
			plan,
			artifactGraph: graph,
			hasRemoteBindings: options.buildConfig.remoteBindings.length > 0
		});
	} finally {
		await rm(temporaryOutput, { recursive: true });
	}
}

function exactProjectInputs(applicationRoot: string, exposureFiles: readonly string[]): string[] {
	const configPath = ts.findConfigFile(applicationRoot, ts.sys.fileExists);
	if (!configPath) return [...exposureFiles];
	const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
	if (loaded.error) throw new Error(formatDiagnostic(loaded.error));
	const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(configPath));
	if (parsed.errors.length) throw new Error(parsed.errors.map(formatDiagnostic).join('\n'));
	return [
		...new Set([...parsed.fileNames.filter((file) => /\.[jt]sx$/i.test(file)), ...exposureFiles])
	].sort();
}

async function applicationPackageName(applicationRoot: string): Promise<string> {
	let manifest: { name?: unknown };
	try {
		manifest = JSON.parse(await readFile(path.join(applicationRoot, 'package.json'), 'utf8')) as {
			name?: unknown;
		};
	} catch {
		throw new Error(`Unable to read the application package manifest at ${applicationRoot}`);
	}
	if (typeof manifest.name !== 'string' || !manifest.name)
		throw new Error('Remote-producing eXact applications require a package name');
	return manifest.name;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
	return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}
