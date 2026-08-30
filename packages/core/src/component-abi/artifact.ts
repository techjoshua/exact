import type { ExactClientComponentArtifact } from './client.js';
import type { ExactServerComponentArtifact } from './server.js';

/** The single current executable artifact carried by a native target-local component export. */
export type ExactComponentExecutableArtifact =
	| ExactClientComponentArtifact
	| ExactServerComponentArtifact;

/** Narrows a current executable artifact to its client ABI without capability inference. */
export function requireExactClientComponentArtifact(
	artifact: ExactComponentExecutableArtifact
): ExactClientComponentArtifact {
	if (artifact.target !== 'client')
		throw new TypeError('Client execution requires a current client component artifact');
	return artifact;
}

/** Narrows a current executable artifact to its server ABI without capability inference. */
export function requireExactServerComponentArtifact(
	artifact: ExactComponentExecutableArtifact
): ExactServerComponentArtifact {
	if (artifact.target !== 'server')
		throw new TypeError('Server execution requires a current server component artifact');
	return artifact;
}
