import type { VNode } from '@exactjs/core';
import type { CoreHydrationRoot, HydrateOptions } from './types.js';
import { hydrateWithClient } from './runtime/hydration.js';
import { createHydrationOnlyClient } from './runtime/root-client.js';

/**
 * Hydrates an SSR root while excluding optional server-operation, patch, and island runtimes.
 * Use the package's main entry when compiler-generated server work or client islands are present.
 */
export function hydrate(
	vnode: VNode,
	container: Element | Document,
	options: HydrateOptions = {}
): CoreHydrationRoot {
	return hydrateWithClient(vnode, container, options, createHydrationOnlyClient);
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
	let root: CoreHydrationRoot | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let resolveRoot!: (root: CoreHydrationRoot) => void;
	let rejectRoot!: (error: unknown) => void;
	const result = new Promise<CoreHydrationRoot>((resolve, reject) => {
		resolveRoot = resolve;
		rejectRoot = reject;
	});
	const interactionEvents = ['pointerdown', 'keydown', 'input', 'change', 'submit'] as const;
	const cleanup = () => {
		if (timer !== undefined) clearTimeout(timer);
		document.removeEventListener('DOMContentLoaded', schedule);
		for (const type of interactionEvents)
			container.removeEventListener(type, activateFromInteraction, true);
	};
	const activate = () => {
		if (!root) {
			cleanup();
			try {
				root = hydrate(vnode, container, options);
				resolveRoot(root);
			} catch (error) {
				rejectRoot(error);
			}
		}
	};
	const activateFromInteraction = () => {
		void activate();
	};
	for (const type of interactionEvents)
		container.addEventListener(type, activateFromInteraction, { capture: true, once: true });
	function schedule() {
		const taskScheduler = (
			globalThis as typeof globalThis & {
				scheduler?: {
					postTask(work: () => void, options: { priority: 'user-blocking' }): Promise<void>;
				};
			}
		).scheduler;
		if (taskScheduler) {
			void taskScheduler.postTask(activate, { priority: 'user-blocking' }).catch(rejectRoot);
			return;
		}
		timer = setTimeout(activate, 0);
	}
	if (document.readyState === 'loading')
		document.addEventListener('DOMContentLoaded', schedule, { once: true });
	else schedule();
	return result;
}

export type { CoreHydrationRoot, HydrateOptions } from './types.js';
