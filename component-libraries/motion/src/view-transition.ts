import { isTaskCancellation } from '@exactjs/core';
import type {
	FrameworkPublicationCoordinator,
	FrameworkPublicationRequest
} from '@exactjs/core/framework/publication';
import { runTaskFrame } from '@exactjs/core/framework/task-frames';
import type { ViewTransitionCoordinatorOptions } from './contracts.js';

type NativeViewTransition = {
	readonly updateCallbackDone: PromiseLike<void>;
	readonly finished: PromiseLike<void>;
	skipTransition(): void;
};

type ViewTransitionDocument = Document & {
	startViewTransition?(update: () => PromiseLike<void> | void): NativeViewTransition;
};

/** Coordinates framework publication through the browser View Transition update callback. */
export function createViewTransitionCoordinator<Metadata = unknown>(
	options: ViewTransitionCoordinatorOptions<Metadata> = {}
): FrameworkPublicationCoordinator<Metadata> {
	return Object.freeze({
		async publish(request: FrameworkPublicationRequest<Metadata>): Promise<void> {
			if (request.signal.aborted) return;
			const document = globalThis.document as ViewTransitionDocument | undefined;
			if (
				options.enabled === false ||
				reducedMotion(options.reducedMotion ?? 'system') ||
				typeof document?.startViewTransition !== 'function'
			) {
				const commit = request.publish();
				await commit.rendered;
				return;
			}

			let transition: NativeViewTransition | undefined;
			const execution = runTaskFrame<void>(
				{
					kind: 'view-transition',
					label: options.name?.(request) ?? request.kind,
					priority: 'immediate',
					readiness: 'nonblocking'
				},
				{
					async work(context) {
						transition = document.startViewTransition!(async () => {
							if (request.signal.aborted || context.signal.aborted) return;
							const commit = request.publish();
							await commit.rendered;
						});
						const skip = () => transition?.skipTransition();
						request.signal.addEventListener('abort', skip, { once: true });
						context.signal.addEventListener('abort', skip, { once: true });
						try {
							await transition.finished;
						} finally {
							request.signal.removeEventListener('abort', skip);
							context.signal.removeEventListener('abort', skip);
						}
					}
				}
			);
			void execution.catch((error) => {
				if (!execution.signal.aborted && !isTaskCancellation(error)) return;
			});
			if (!transition) {
				await execution;
				return;
			}
			await transition.updateCallbackDone;
		}
	});
}

function reducedMotion(policy: 'system' | 'always' | 'never'): boolean {
	if (policy === 'always') return true;
	if (policy === 'never') return false;
	return (
		typeof globalThis.matchMedia === 'function' &&
		globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}
