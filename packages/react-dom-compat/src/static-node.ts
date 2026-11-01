import type { ReactNode } from '@exactjs/react-compat';
import { Readable } from 'node:stream';
import { renderToPipeableStream } from './server/node.js';
import {
	renderReactToStringAsync,
	withBootstrapScripts,
	type ServerRenderOptions
} from './server/shared.js';
import { prerender, resume, resumeAndPrerender } from './static-shared.js';

export { prerender, resume, resumeAndPrerender };

/** Performs the prerender to node stream domain operation. */
export async function prerenderToNodeStream(
	node: ReactNode,
	options?: ServerRenderOptions
): Promise<{ prelude: Readable; postponed: null }> {
	const resolved = { ...options, nonce: undefined };
	return {
		prelude: Readable.from([
			withBootstrapScripts(await renderReactToStringAsync(node, resolved), resolved)
		]),
		postponed: null
	};
}

/** Performs the resume and prerender to node stream domain operation. */
export async function resumeAndPrerenderToNodeStream(
	node: ReactNode,
	_postponedState: unknown,
	options?: ServerRenderOptions
) {
	return prerenderToNodeStream(node, options);
}

/** Renders a fresh all-ready tree with the ordinary pipeable stream cancellation and settlement contract. */
export function resumeToPipeableStream(
	node: ReactNode,
	_postponedState: unknown,
	options?: ServerRenderOptions
) {
	return renderToPipeableStream(node, options);
}
