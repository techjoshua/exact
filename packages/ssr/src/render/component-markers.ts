import { markerId } from '../markup.js';
import type { SsrContext } from '../types.js';
import type { ServerComponentReference } from './server-component-reference.js';

/** Allocates one component marker from its compiler identity and authored key. */
export function componentMarkerId(
	context: SsrContext,
	reference: ServerComponentReference
): string {
	return markerId(context, 'component', reference.contract.artifact.id, reference.key);
}
