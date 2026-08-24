import type { RenderToDocumentStreamOptions } from '../types.js';

/** Reports whether document streaming options require a hydration payload. */
export function shouldEmitDocumentHydration(options: RenderToDocumentStreamOptions): boolean {
	if (options.hydration === false) return false;
	if (options.hydration === true) return true;
	return (
		options.endpoint !== undefined ||
		options.endpoints !== undefined ||
		options.state !== undefined ||
		options.continuations !== undefined ||
		options.publicContexts !== undefined ||
		options.executionRoot !== undefined ||
		options.binding !== undefined ||
		options.buildKey !== undefined ||
		options.scriptId !== undefined ||
		options.nonce !== undefined
	);
}
