import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sourceMapPathFor, withSourceMapFile, withSourceMappingUrl } from '../source-maps.js';
import type { CompileArtifactsResult, ExactArtifactPlanEntry, TransformResult } from '../types.js';
import type { ExactModuleAnalysis } from '../contracts/module-analysis.js';
import {
	removeGeneratedArtifact,
	sharedArtifactFacade,
	sharedArtifactResult
} from './shared-artifact.js';
import { retainArtifactAnalysis } from './analysis-results.js';
import { artifactAnalysis } from './analysis-results.js';
import { createArtifactBuildProducts } from './build-products.js';

/** Prepares one planned client/server artifact pair without publishing filesystem output. */
export function prepareArtifactPlanEntry(
	entry: ExactArtifactPlanEntry,
	base: ExactModuleAnalysis,
	client: TransformResult,
	server: TransformResult,
	sourceMap: boolean
): CompileArtifactsResult {
	const shared = !sourceMap && sharedArtifactResult(base, client, server);
	const clientMapFile = client.map ? sourceMapPathFor(entry.clientFile) : undefined;
	const serverMapFile = server.map ? sourceMapPathFor(entry.serverFile) : undefined;

	return retainArtifactAnalysis(
		{
			inputFile: entry.inputFile,
			clientFile: entry.clientFile,
			serverFile: entry.serverFile,
			...(shared ? { sharedFile: entry.sharedFile } : {}),
			clientMapFile,
			serverMapFile,
			client,
			server,
			...(shared ? { shared } : {}),
			build: createArtifactBuildProducts(entry.inputFile, base)
		},
		base
	);
}

/** Publishes a previously prepared artifact pair after every validation gate accepts it. */
export async function publishArtifactPlanEntry(
	entry: ExactArtifactPlanEntry,
	result: CompileArtifactsResult
): Promise<void> {
	await mkdir(path.dirname(result.clientFile), { recursive: true });
	await writeFile(
		result.clientFile,
		result.shared
			? sharedArtifactFacade(artifactAnalysis(result), result.sharedFile!, result.clientFile)
			: result.clientMapFile
				? withSourceMappingUrl(result.client.code, path.basename(result.clientMapFile))
				: result.client.code
	);
	await writeFile(
		result.serverFile,
		result.shared
			? sharedArtifactFacade(artifactAnalysis(result), result.sharedFile!, result.serverFile)
			: result.serverMapFile
				? withSourceMappingUrl(result.server.code, path.basename(result.serverMapFile))
				: result.server.code
	);
	if (result.shared) await writeFile(result.sharedFile!, result.shared.code);
	else await removeGeneratedArtifact(entry.sharedFile);
	if (result.clientMapFile && result.client.map)
		await writeFile(
			result.clientMapFile,
			`${JSON.stringify(withSourceMapFile(result.client.map, path.basename(result.clientFile)), null, 2)}\n`
		);
	if (result.serverMapFile && result.server.map)
		await writeFile(
			result.serverMapFile,
			`${JSON.stringify(withSourceMapFile(result.server.map, path.basename(result.serverFile)), null, 2)}\n`
		);
}
