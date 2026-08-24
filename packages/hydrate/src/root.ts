import type { VNode } from '@exactjs/core';
import type { CoreHydrationRoot, HydrateOptions } from './types.js';
import { hydrateWithClient } from './runtime/hydration.js';
import { createHydrationOnlyClient } from './runtime/root-client.js';
import { resolveRootHydrateOptions } from './root-config.js';
export { readPublishedRootProps } from './root-config.js';
import { assertCurrentDocumentContainer } from './runtime/current-document.js';

/**
 * Hydrates an SSR root while excluding optional server-operation, patch, and island runtimes.
 * Use the package's main entry when compiler-generated server work or client islands are present.
 */
export function hydrate(
	vnode: VNode,
	container: Element | Document,
	options: HydrateOptions = {}
): CoreHydrationRoot {
	return hydrateWithClient(
		vnode,
		container,
		options,
		createHydrationOnlyClient,
		resolveRootHydrateOptions
	);
}

/**
 * Defers hydration beyond DOMContentLoaded while synchronously activating for an earlier user
 * interaction. The returned promise resolves to the owned root after the first trigger wins.
 */
export function hydrateAfterNavigation(
	vnode: VNode,
	container: Element,
	options: HydrateOptions = {}
): Promise<CoreHydrationRoot> {
	try {
		assertCurrentDocumentContainer(container);
	} catch (error) {
		return Promise.reject(error);
	}
	const ownerDocument = container.ownerDocument;
	const ownerWindow = ownerDocument.defaultView;
	const requestFrame =
		ownerWindow?.requestAnimationFrame?.bind(ownerWindow) ??
		globalThis.requestAnimationFrame?.bind(globalThis);
	const cancelFrame =
		ownerWindow?.cancelAnimationFrame?.bind(ownerWindow) ??
		globalThis.cancelAnimationFrame?.bind(globalThis);
	const taskScheduler =
		(ownerWindow as (Window & typeof globalThis & { scheduler?: NavigationTaskScheduler }) | null)
			?.scheduler ??
		(globalThis as typeof globalThis & { scheduler?: NavigationTaskScheduler }).scheduler;
	let status: 'pending' | 'activating' | 'resolved' | 'rejected' = 'pending';
	let timer: number | ReturnType<typeof setTimeout> | undefined;
	let animationFrame: number | undefined;
	let resolveRoot!: (root: CoreHydrationRoot) => void;
	let rejectRoot!: (error: unknown) => void;
	const result = new Promise<CoreHydrationRoot>((resolve, reject) => {
		resolveRoot = resolve;
		rejectRoot = reject;
	});
	const interactionEvents = ['pointerdown', 'keydown', 'input', 'change', 'submit'] as const;
	const cleanup = () => {
		if (timer !== undefined) {
			if (ownerWindow) ownerWindow.clearTimeout(timer as number);
			else clearTimeout(timer);
			timer = undefined;
		}
		if (animationFrame !== undefined) {
			cancelFrame?.(animationFrame);
			animationFrame = undefined;
		}
		ownerDocument.removeEventListener('DOMContentLoaded', schedule);
		for (const type of interactionEvents)
			container.removeEventListener(type, activateFromInteraction, true);
	};
	const activate = () => {
		if (status !== 'pending') return;
		status = 'activating';
		cleanup();
		try {
			const root = hydrate(vnode, container, options);
			status = 'resolved';
			resolveRoot(root);
		} catch (error) {
			status = 'rejected';
			rejectRoot(error);
		}
	};
	const rejectActivation = (error: unknown) => {
		if (status !== 'pending') return;
		status = 'rejected';
		cleanup();
		rejectRoot(error);
	};
	const activateFromInteraction = () => {
		void activate();
	};
	for (const type of interactionEvents)
		container.addEventListener(type, activateFromInteraction, { capture: true, once: true });
	function schedule() {
		if (status !== 'pending') return;
		// A task posted directly from DOMContentLoaded may run before the next rendering opportunity.
		// Wait through one frame so passive hydration cannot delay SSR FCP. Hidden documents use a
		// task because their animation frames may be throttled indefinitely.
		try {
			if (ownerDocument.visibilityState === 'visible' && requestFrame) {
				animationFrame = requestFrame(() => {
					animationFrame = undefined;
					scheduleActivationTask();
				});
				return;
			}
			scheduleActivationTask();
		} catch (error) {
			rejectActivation(error);
		}
	}
	function scheduleActivationTask() {
		if (status !== 'pending') return;
		try {
			if (taskScheduler) {
				void taskScheduler.postTask(activate, { priority: 'user-visible' }).catch(rejectActivation);
				return;
			}
			timer = ownerWindow ? ownerWindow.setTimeout(activate, 0) : setTimeout(activate, 0);
		} catch (error) {
			rejectActivation(error);
		}
	}
	if (ownerDocument.readyState === 'loading')
		ownerDocument.addEventListener('DOMContentLoaded', schedule, { once: true });
	else schedule();
	return result;
}

type NavigationTaskScheduler = {
	postTask(work: () => void, options: { priority: 'user-visible' }): Promise<void>;
};

export type { CoreHydrationRoot, HydrateOptions } from './types.js';
