import { eraseAdapterJavaScriptHelperTypes } from './adapter-javascript-output.js';
import { isExactSourceMap } from '../source-maps.js';
import { retainArtifactComponentFacts } from './artifact-component-facts.js';
import {
	artifactEnhancementDeclarations,
	linkArtifactEnhancements
} from './artifact-enhancements.js';
import path from 'node:path';
import { sourceMapPathFor, withSourceMapFile, withSourceMappingUrl } from '../source-maps.js';
import type {
	CompileArtifactsResult,
	ExactArtifactPlanEntry,
	TransformResult,
	ModuleRewriteOptions
} from '../types.js';
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
	sourceMap: boolean,
	rewrites?: { client?: ModuleRewriteOptions; server?: ModuleRewriteOptions }
): CompileArtifactsResult {
	const clientOutput = eraseAdapterJavaScriptHelperTypes(client, entry.inputFile);
	const serverOutput = eraseAdapterJavaScriptHelperTypes(server, entry.inputFile);
	client = {
		...client,
		code: clientOutput.code,
		map: isExactSourceMap(clientOutput.map) ? clientOutput.map : client.map
	};
	server = {
		...server,
		code: serverOutput.code,
		map: isExactSourceMap(serverOutput.map) ? serverOutput.map : server.map
	};
	client = linkArtifactEnhancements(client, entry.inputFile, entry.clientFile, rewrites?.client);
	server = linkArtifactEnhancements(server, entry.inputFile, entry.serverFile, rewrites?.server);
	const shared = !sourceMap && sharedArtifactResult(base, client, server);
	client = retainArtifactComponentFacts(client, rewrites?.client);
	server = retainArtifactComponentFacts(server, rewrites?.server);
	const clientMapFile = client.map
		? sourceMapPathFor(implementationFile(entry.clientFile, client))
		: undefined;
	const serverMapFile = server.map
		? sourceMapPathFor(implementationFile(entry.serverFile, server))
		: undefined;

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

/** Gives a JSX-bearing implementation its host parser while retaining target recognition and relative imports. */
function hostJsxFile(file: string): string {
	if (!/\.[jt]s$/i.test(file)) return file;
	return file.replace(/(\.exact\.(?:client|server|shared))?(\.[jt]s)$/i, '.host-jsx$1$2x');
}

function implementationFile(planned: string, output: TransformResult): string {
	return output.preservesHostJsx ? hostJsxFile(planned) : planned;
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
	const mutations: CompilerOutputMutation[] = [];
	const analysis = artifactAnalysis(result);
	const prepare = (
		planned: string,
		output?: TransformResult,
		mapFile?: string,
		facade?: string
	) => {
		const host = hostJsxFile(planned);
		const actual = output && !facade ? implementationFile(planned, output) : planned;
		const code =
			output && mapFile ? withSourceMappingUrl(output.code, path.basename(mapFile)) : output?.code;
		mutations.push({
			file: planned,
			content:
				facade ?? (actual !== planned ? sharedArtifactFacade(analysis, actual, planned) : code)
		});
		if (actual !== planned) mutations.push({ file: actual, content: code });
		else if (host !== planned) mutations.push({ file: host });
		if (mapFile && output?.map) {
			mutations.push({
				file: mapFile,
				content: `${JSON.stringify(withSourceMapFile(output.map, path.basename(actual)), null, 2)}\n`
			});
		}
		if (mapFile !== sourceMapPathFor(planned)) mutations.push({ file: sourceMapPathFor(planned) });
		if (host !== planned && mapFile !== sourceMapPathFor(host))
			mutations.push({ file: sourceMapPathFor(host) });
	};
	for (const [planned, output, mapFile] of [
		[entry.clientFile, result.client, result.clientMapFile],
		[entry.serverFile, result.server, result.serverMapFile]
	] as const) {
		const facade = result.shared && sharedArtifactFacade(analysis, result.sharedFile!, planned);
		prepare(planned, output, mapFile, facade);
		mutations.push({
			file: planned + '.enhancements.d.ts',
			content: artifactEnhancementDeclarations(output)
		});
	}
	prepare(entry.sharedFile, result.shared);
	return mutations;
}
