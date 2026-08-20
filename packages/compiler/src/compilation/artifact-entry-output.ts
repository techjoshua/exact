import path from 'node:path';
import { sourceMapPathFor, withSourceMapFile, withSourceMappingUrl } from '../source-maps.js';
import type { CompileArtifactsResult, ExactArtifactPlanEntry, TransformResult } from '../types.js';
import type { ExactModuleAnalysis } from '../contracts/module-analysis.js';
import { sharedArtifactFacade, sharedArtifactResult } from './shared-artifact.js';
import { retainArtifactAnalysis } from './analysis-results.js';
import { artifactAnalysis } from './analysis-results.js';
import { createArtifactBuildProducts } from './build-products.js';
import { publishOutputTransaction, type CompilerOutputMutation } from './output-transaction.js';

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
	await publishArtifactPlanEntries([entry], [result]);
}

/** Publishes a validated project artifact set through one rollback-capable transaction. */
export async function publishArtifactPlanEntries(
	entries: readonly ExactArtifactPlanEntry[],
	results: readonly CompileArtifactsResult[],
	extraMutations: readonly CompilerOutputMutation[] = []
): Promise<void> {
	if (entries.length !== results.length)
		throw new Error('Compiler artifact publication requires one result for every plan entry');
	const mutations = results.flatMap((result, index) =>
		artifactOutputMutations(entries[index]!, result)
	);
	await publishOutputTransaction([...mutations, ...extraMutations]);
}

/** Prepares the complete file mutation set for one compiled artifact entry. */
export function artifactOutputMutations(
	entry: ExactArtifactPlanEntry,
	result: CompileArtifactsResult
): CompilerOutputMutation[] {
	return [
		{
			file: result.clientFile,
			content: result.shared
				? sharedArtifactFacade(artifactAnalysis(result), result.sharedFile!, result.clientFile)
				: result.clientMapFile
					? withSourceMappingUrl(result.client.code, path.basename(result.clientMapFile))
					: result.client.code
		},
		{
			file: result.serverFile,
			content: result.shared
				? sharedArtifactFacade(artifactAnalysis(result), result.sharedFile!, result.serverFile)
				: result.serverMapFile
					? withSourceMappingUrl(result.server.code, path.basename(result.serverMapFile))
					: result.server.code
		},
		result.shared
			? { file: result.sharedFile!, content: result.shared.code }
			: { file: entry.sharedFile },
		...(result.clientMapFile && result.client.map
			? [
					{
						file: result.clientMapFile,
						content: `${JSON.stringify(withSourceMapFile(result.client.map, path.basename(result.clientFile)), null, 2)}\n`
					}
				]
			: []),
		...(result.serverMapFile && result.server.map
			? [
					{
						file: result.serverMapFile,
						content: `${JSON.stringify(withSourceMapFile(result.server.map, path.basename(result.serverFile)), null, 2)}\n`
					}
				]
			: [])
	];
}
