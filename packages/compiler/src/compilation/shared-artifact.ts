import { unlink } from 'node:fs/promises';
import path from 'node:path';
import type { ExactModuleAnalysis, TransformResult } from '../types.js';

/** Performs the shared artifact result domain operation. */
export function sharedArtifactResult(
	analysis: ExactModuleAnalysis,
	client: TransformResult,
	server: TransformResult
): TransformResult | undefined {
	if (
		client.code !== server.code ||
		analysis.assets.length ||
		analysis.boundaries.length ||
		Object.keys(analysis.serverActions).length ||
		analysis.components.some(
			(component) =>
				component.tasks.length || component.contexts.length || component.clientIslandCount
		) ||
		analysis.callables.some((callable) => callable.effect !== 'neutral') ||
		analysis.policy.subjects.some(
			(subject) => subject.policy.secret || subject.policy.residency !== 'shared'
		) ||
		analysis.semanticGraph?.declarations.some(
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
	analysis: ExactModuleAnalysis,
	sharedFile: string,
	targetFile: string
): string {
	let specifier = path.relative(path.dirname(targetFile), sharedFile).replaceAll(path.sep, '/');
	if (!specifier.startsWith('.')) specifier = `./${specifier}`;
	const lines = [`export * from ${JSON.stringify(specifier)};`];
	if (analysis.exports.some((exported) => exported.name === 'default')) {
		lines.push(`export { default } from ${JSON.stringify(specifier)};`);
	}
	return `${lines.join('\n')}\n`;
}
