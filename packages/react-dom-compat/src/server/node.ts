import type { ReactNode } from '@exactjs/react-compat';
import { Readable, type Writable } from 'node:stream';
import {
	renderReactToString,
	renderReactToStringAsync,
	renderToReadableStream,
	renderToStaticMarkup,
	renderToString,
	type ServerRenderOptions,
	withBootstrapScripts
} from './shared.js';

export { renderToReadableStream, renderToStaticMarkup, renderToString };
export type { ServerRenderOptions };

/** Configures pipeable stream. */
export interface PipeableStreamOptions extends ServerRenderOptions {
	onShellReady?: () => void;
	onShellError?: (error: unknown) => void;
	onAllReady?: () => void;
}

/** Defines the pipeable stream interface contract. */
export interface PipeableStream {
	pipe(destination: Writable): Writable;
	abort(reason?: unknown): void;
}

function nodeStream(html: string): Readable {
	return Readable.from([html]);
}

/** Transforms to node stream into its required representation. */
export function renderToNodeStream(node: ReactNode, options?: ServerRenderOptions): Readable {
	return nodeStream(renderReactToString(node, options));
}

/** Transforms to static node stream into its required representation. */
export function renderToStaticNodeStream(node: ReactNode, options?: ServerRenderOptions): Readable {
	return nodeStream(renderReactToString(node, options));
}

/** Transforms to pipeable stream into its required representation. */
export function renderToPipeableStream(
	node: ReactNode,
	options: PipeableStreamOptions = {}
): PipeableStream {
	const controller = new AbortController();
	const signal = options.signal
		? AbortSignal.any([options.signal, controller.signal])
		: controller.signal;
	let destination: Writable | undefined;
	let completed: string | undefined;
	let failed: unknown;
	let hasFailed = false;
	const pump = () => {
		if (!destination) return;
		if (hasFailed || signal.aborted) {
			const error = hasFailed ? failed : signal.reason;
			destination.destroy?.(error instanceof Error ? error : new Error(String(error)));
			return;
		}
		if (completed !== undefined) nodeStream(completed).pipe(destination);
	};
	void renderReactToStringAsync(node, { ...options, signal }).then(
		(html) => {
			completed = withBootstrapScripts(html, options);
			options.onShellReady?.();
			options.onAllReady?.();
			pump();
		},
		(error) => {
			hasFailed = true;
			failed = error;
			options.onShellError?.(error);
			pump();
		}
	);
	return {
		pipe(next) {
			if (destination) throw new Error('React compatibility stream has already been piped');
			destination = next;
			pump();
			return next;
		},
		abort(reason) {
			controller.abort(reason === undefined ? new Error('The render was aborted') : reason);
			pump();
		}
	};
}
