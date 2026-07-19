import type { ReactNode } from '@exact/react-compat';
import { Readable, type Writable } from 'node:stream';
import {
	renderReactToStringAsync,
	withBootstrapScripts,
	type ServerRenderOptions
} from './server-shared.js';
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

/** Performs the resume to pipeable stream domain operation. */
export function resumeToPipeableStream(
	node: ReactNode,
	_postponedState: unknown,
	options?: ServerRenderOptions
) {
	let destination: Writable | undefined;
	let html: string | undefined;
	void renderReactToStringAsync(node, options).then(
		(value) => {
			html = withBootstrapScripts(value, options ?? {});
			if (destination) Readable.from([html]).pipe(destination);
		},
		(error) => destination?.destroy?.(error instanceof Error ? error : new Error(String(error)))
	);
	return {
		pipe(next: Writable) {
			destination = next;
			if (html !== undefined) Readable.from([html]).pipe(next);
			return next;
		},
		abort() {}
	};
}
