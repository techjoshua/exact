import type { ReactNode } from '@exactjs/react-compat';
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
	const controller = new AbortController();
	const signal = options?.signal
		? AbortSignal.any([options.signal, controller.signal])
		: controller.signal;
	const resolved = { ...options, signal };
	void renderReactToStringAsync(node, resolved).then(
		(value) => {
			if (signal.aborted) return;
			html = withBootstrapScripts(value, resolved);
			if (destination) Readable.from([html]).pipe(destination);
		},
		(error) => destination?.destroy?.(error instanceof Error ? error : new Error(String(error)))
	);
	return {
		pipe(next: Writable) {
			destination = next;
			if (signal.aborted) {
				const reason = signal.reason;
				next.destroy(reason instanceof Error ? reason : new Error(String(reason ?? 'aborted')));
			} else if (html !== undefined) Readable.from([html]).pipe(next);
			return next;
		},
		abort(reason?: unknown) {
			if (controller.signal.aborted) return;
			const error =
				reason instanceof Error
					? reason
					: new DOMException(
							typeof reason === 'string' ? reason : 'React static render aborted',
							'AbortError'
						);
			controller.abort(error);
			destination?.destroy(error);
		}
	};
}
