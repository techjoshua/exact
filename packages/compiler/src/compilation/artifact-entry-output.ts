import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withArtifactMetadata } from '../paths.js';
import { sourceMapPathFor, withSourceMapFile, withSourceMappingUrl } from '../source-maps.js';
import type {
	CompileArtifactsResult,
	ExactArtifactPlanEntry,
	ExactCompilerManifest,
	TransformResult
} from '../types.js';
import {
	removeGeneratedArtifact,
	sharedArtifactFacade,
	sharedArtifactResult
} from './shared-artifact.js';

/** Writes one planned client/server artifact pair and its portable manifest. */
export async function writeArtifactPlanEntry(
	entry: ExactArtifactPlanEntry,
	base: ExactCompilerManifest,
	client: TransformResult,
	server: TransformResult,
	sourceMap: boolean
): Promise<CompileArtifactsResult> {
	const shared = !sourceMap && sharedArtifactResult(base, client, server);
	const manifest = withArtifactMetadata(base, entry.inputFile, {
		...entry,
		...(!shared ? { sharedFile: undefined } : {})
	});
	const clientMapFile = client.map ? sourceMapPathFor(entry.clientFile) : undefined;
	const serverMapFile = server.map ? sourceMapPathFor(entry.serverFile) : undefined;

	await mkdir(path.dirname(entry.clientFile), { recursive: true });
	await writeFile(
		entry.clientFile,
		shared
			? sharedArtifactFacade(base, entry.sharedFile, entry.clientFile)
			: clientMapFile
				? withSourceMappingUrl(client.code, path.basename(clientMapFile))
				: client.code
	);
	await writeFile(
		entry.serverFile,
		shared
			? sharedArtifactFacade(base, entry.sharedFile, entry.serverFile)
			: serverMapFile
				? withSourceMappingUrl(server.code, path.basename(serverMapFile))
				: server.code
	);
	if (shared) await writeFile(entry.sharedFile, shared.code);
	else await removeGeneratedArtifact(entry.sharedFile);
	if (clientMapFile && client.map)
		await writeFile(
			clientMapFile,
			`${JSON.stringify(withSourceMapFile(client.map, path.basename(entry.clientFile)), null, 2)}\n`
		);
	if (serverMapFile && server.map)
		await writeFile(
			serverMapFile,
			`${JSON.stringify(withSourceMapFile(server.map, path.basename(entry.serverFile)), null, 2)}\n`
		);
	await writeFile(entry.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

	return {
		inputFile: entry.inputFile,
		clientFile: entry.clientFile,
		serverFile: entry.serverFile,
		...(shared ? { sharedFile: entry.sharedFile } : {}),
		clientMapFile,
		serverMapFile,
		manifestFile: entry.manifestFile,
		client,
		server,
		...(shared ? { shared } : {}),
		manifest
	};
}
