import { unlink } from 'node:fs/promises';
import type { TransformResult } from '../types.js';
import type { ExactModuleAnalysis } from '../contracts/module-analysis.js';

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
		analysis.continuations.some((continuation) => continuation.invocation) ||
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
