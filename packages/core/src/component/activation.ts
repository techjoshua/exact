import { isPromiseLike } from './async-value.js';
import { observeLifecyclePromise } from './async.js';
import type { ComponentInstance } from './contracts.js';
import { componentDomainInspection } from './domain.js';
import { createErrorReport, handleComponentError } from './errors.js';
import { componentLifecycleHandlers } from './lifecycle-handlers.js';

/** Controls active/deactive lifecycle transitions for one mounted component instance. */
export type ComponentActivation = Readonly<{
	get active(): boolean;
	update(reason?: string): void;
	deactivate(reason: string): void;
}>;

/** Creates the Activity-aware activation state machine owned by a component instance. */
export function createComponentActivation(
	instance: ComponentInstance<any>,
	isMounted: () => boolean,
	isDisposed: () => boolean,
	blockerCount: () => number
): ComponentActivation {
	let active = false;
	const deactivate = (reason: string): void => {
		if (!active) return;
		active = false;
		componentDomainInspection(instance.domain)?.publish({
			kind: 'component.deactivate',
			component: instance,
			reason
		});
		instance.activationController?.abort(reason);
		instance.activationController = undefined;
		for (const handler of componentLifecycleHandlers(instance, 'deactivate')) {
			try {
				const result = handler({ signal: AbortSignal.abort(reason), reason });
				if (isPromiseLike(result))
					observeLifecyclePromise(instance, Promise.resolve(result), 'deactivate');
			} catch (error) {
				handleComponentError(
					instance,
					createErrorReport(error, 'lifecycle', instance, 'deactivate')
				);
			}
		}
	};
	return {
		get active() {
			return active;
		},
		update(reason = 'activity') {
			if (!isMounted() || isDisposed() || blockerCount()) {
				deactivate(reason);
				return;
			}
			if (active) return;
			active = true;
			componentDomainInspection(instance.domain)?.publish({
				kind: 'component.activate',
				component: instance,
				reason
			});
			const handlers = componentLifecycleHandlers(instance, 'activate');
			instance.activationController = handlers.length ? new AbortController() : undefined;
			for (const handler of handlers) {
				try {
					const result = handler({ signal: instance.activationController!.signal });
					if (isPromiseLike(result))
						observeLifecyclePromise(instance, Promise.resolve(result), 'activate');
				} catch (error) {
					handleComponentError(
						instance,
						createErrorReport(error, 'lifecycle', instance, 'activate')
					);
				}
			}
		},
		deactivate
	};
}
