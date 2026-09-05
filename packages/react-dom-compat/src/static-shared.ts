import type { ReactNode } from '@exactjs/react-compat';
import {
	readableStreamFromString,
	renderReactToStringAsync,
	withBootstrapScripts,
	type ServerRenderOptions
} from './server/shared.js';

/** Tracks the state owned by postponed. */
export type PostponedState = null;

/** Performs the prerender domain operation. */
export async function prerender(
	node: ReactNode,
	options?: ServerRenderOptions
): Promise<{ prelude: ReadableStream<Uint8Array>; postponed: PostponedState }> {
	const resolved = { ...options, nonce: undefined };
	return {
		prelude: readableStreamFromString(
			withBootstrapScripts(await renderReactToStringAsync(node, resolved), resolved)
		),
		postponed: null
	};
}

/** Performs the resume domain operation. */
export async function resume(
	node: ReactNode,
	_postponedState: unknown,
	options?: ServerRenderOptions
): Promise<ReadableStream<Uint8Array>> {
	return readableStreamFromString(
		withBootstrapScripts(await renderReactToStringAsync(node, options), options ?? {})
	);
}

/** Performs the resume and prerender domain operation. */
export function resumeAndPrerender(
	node: ReactNode,
	_postponedState: unknown,
	options?: ServerRenderOptions
) {
	return prerender(node, options);
}
