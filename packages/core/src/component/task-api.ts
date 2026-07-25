import type {
	ComponentTask,
	ComponentTaskRegistration,
	TaskPlacementRequest,
	TaskPolicy
} from './contracts.js';

type RegisterTask = (policy: TaskPolicy, args: readonly unknown[]) => void;

/**
 * Creates the callable component task surface from one normalized registration operation.
 *
 * Facets are memoized policy views over the same registrar. Placement is intentionally available
 * only from the root task object, while priority and readiness remain composable in either order.
 */
export function createComponentTaskApi(register: RegisterTask): ComponentTask {
	const registrations = new Map<string, ComponentTaskRegistration>();

	const registration = (
		placement: TaskPlacementRequest,
		priority: TaskPolicy['priority'],
		readiness: TaskPolicy['readiness']
	): ComponentTaskRegistration => {
		const key = `${placement}:${priority}:${readiness}`;
		const existing = registrations.get(key);
		if (existing) return existing;

		const callable = ((...args: unknown[]) =>
			register({ placement, priority, readiness }, args)) as ComponentTaskRegistration;
		registrations.set(key, callable);
		Object.defineProperties(callable, {
			deferred: {
				enumerable: true,
				get: () => registration(placement, 'deferred', readiness)
			},
			blocking: {
				enumerable: true,
				get: () => registration(placement, priority, 'blocking')
			}
		});
		return callable;
	};

	const root = registration('inferred', 'normal', 'nonblocking') as ComponentTask;
	Object.defineProperties(root, {
		server: {
			enumerable: true,
			get: () => registration('server', 'normal', 'nonblocking')
		},
		client: {
			enumerable: true,
			get: () => registration('client', 'normal', 'nonblocking')
		}
	});
	return root;
}
