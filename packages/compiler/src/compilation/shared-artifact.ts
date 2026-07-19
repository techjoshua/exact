import { unlink } from 'node:fs/promises';
import path from 'node:path';
import type { ExactCompilerManifest, TransformResult } from '../types.js';

/** Performs the shared artifact result domain operation. */
export function sharedArtifactResult(
	manifest: ExactCompilerManifest,
	client: TransformResult,
	server: TransformResult
): TransformResult | undefined {
	if (
		client.code !== server.code ||
		manifest.assets.length ||
		manifest.boundaries.length ||
		Object.keys(manifest.serverActions).length ||
		manifest.components.some(
			(component) =>
				component.tasks.length || component.contexts.length || component.clientIslandCount
		) ||
		manifest.callables.some((callable) => callable.effect !== 'neutral') ||
		manifest.policy.subjects.some(
			(subject) => subject.policy.secret || subject.policy.residency !== 'isomorphic'
		) ||
		manifest.semanticGraph?.declarations.some(
			(declaration) => declaration.kind === 'import' && !declaration.typeOnly
		)
	)
		return undefined;
	return client;
}

/** Releases generated artifact and its owned resources. */
export async function removeGeneratedArtifact(filename: string): Promise<void> {
	try {
		await unlink(filename);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
}

/** Performs the shared artifact facade domain operation. */
export function sharedArtifactFacade(
	manifest: ExactCompilerManifest,
	sharedFile: string,
	targetFile: string
): string {
	let specifier = path.relative(path.dirname(targetFile), sharedFile).replaceAll(path.sep, '/');
	if (!specifier.startsWith('.')) specifier = `./${specifier}`;
	const lines = [`export * from ${JSON.stringify(specifier)};`];
	if (manifest.exports.some((exported) => exported.name === 'default')) {
		lines.push(`export { default } from ${JSON.stringify(specifier)};`);
	}
	return `${lines.join('\n')}\n`;
}
