/** Resource cancellation retained independently of a task's successful outcome. */
type TaskResourceLifetime = {
	readonly controller: AbortController;
	readonly releaseOwner: () => void;
	readonly pending: Set<Promise<void>>;
};
const owners = new WeakSet<AbortSignal>();
const closedOwners = new WeakSet<AbortSignal>();
const lifetimes = new WeakMap<AbortSignal, TaskResourceLifetime>();

/** Enrolls a generation without allocating resource storage until a helper needs it. */
export function registerTaskResourceOwner(signal: AbortSignal): void {
	owners.add(signal);
}

/**
 * Returns cancellation for resources of an enrolled generation. Outside a framework
 * generation the supplied signal remains the complete lifetime. A successful task
 * closes its resource signal without turning its result into cancellation.
 */
export function taskResourceSignal(owner: AbortSignal): AbortSignal {
	if (!owners.has(owner)) return owner;
	let lifetime = lifetimes.get(owner);
	if (!lifetime) {
		const controller = new AbortController();
		const abort = () => controller.abort(owner.reason);
		lifetime = {
			controller,
			releaseOwner: () => owner.removeEventListener('abort', abort),
			pending: new Set()
		};
		lifetimes.set(owner, lifetime);
		controller.signal.addEventListener('abort', lifetime.releaseOwner, { once: true });
		if (closedOwners.has(owner)) controller.abort('task-resources-settled');
		else if (owner.aborted) abort();
		else owner.addEventListener('abort', abort, { once: true });
	}
	return lifetime.controller.signal;
}

/** Retains asynchronous resource cleanup until generation settlement. */
export function trackTaskResourceCleanup(owner: AbortSignal, cleanup: Promise<void>): void {
	const lifetime = lifetimes.get(owner);
	if (!lifetime) return;
	lifetime.pending.add(cleanup);
	void cleanup.finally(() => lifetime.pending.delete(cleanup)).catch(() => undefined);
}

/** Closes resource ownership and waits for cleanup without aborting successful task work. */
export function settleTaskResourceLifetime(owner: AbortSignal): Promise<void> | undefined {
	closedOwners.add(owner);
	const lifetime = lifetimes.get(owner);
	if (!lifetime) return;
	lifetime.releaseOwner();
	lifetime.controller.abort('task-resources-settled');
	if (lifetime.pending.size) return drainTaskResourceCleanup(lifetime);
}

/** Includes cleanup started by other cleanup while preserving the synchronous empty path. */
async function drainTaskResourceCleanup(lifetime: TaskResourceLifetime): Promise<void> {
	while (lifetime.pending.size) await Promise.allSettled([...lifetime.pending]);
}
