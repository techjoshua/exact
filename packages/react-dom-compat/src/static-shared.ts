import type { ReactNode } from '@exact/react-compat';
import {
	readableStreamFromString,
	renderReactToStringAsync,
	withBootstrapScripts,
	type ServerRenderOptions
} from './server-shared.js';

export type PostponedState = null;

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

export async function resume(
	node: ReactNode,
	_postponedState: unknown,
	options?: ServerRenderOptions
): Promise<ReadableStream<Uint8Array>> {
	return readableStreamFromString(
		withBootstrapScripts(await renderReactToStringAsync(node, options), options ?? {})
	);
}

export function resumeAndPrerender(
	node: ReactNode,
	_postponedState: unknown,
	options?: ServerRenderOptions
) {
	return prerender(node, options);
}
