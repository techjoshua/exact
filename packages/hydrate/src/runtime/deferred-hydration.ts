/** Defers hydration until one rendering opportunity passes or an interaction wins first. */
export function deferHydrationAfterNavigation<T>(
	activateHydration: () => T,
	container: Element
): Promise<T> {
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
	let resolveRoot!: (root: T) => void;
	let rejectRoot!: (error: unknown) => void;
	const result = new Promise<T>((resolve, reject) => {
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
			const root = activateHydration();
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
	const activateFromInteraction = () => void activate();
	for (const type of interactionEvents)
		container.addEventListener(type, activateFromInteraction, { capture: true, once: true });
	function schedule() {
		if (status !== 'pending') return;
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
