import type { TaskOwnerRecord } from './frame-runtime.js';

const taskOwnerHost = Symbol.for('@exactjs/task-owner-host');
const taskOwnersByHost = new WeakMap<object, TaskOwnerRecord>();

/** Associates a durable framework host with its task owner. */
export function registerTaskOwnerHost(host: object, owner: TaskOwnerRecord): void {
	taskOwnersByHost.set(host, owner);
	Object.defineProperty(host, taskOwnerHost, {
		value: owner,
		configurable: true,
		enumerable: false,
		writable: false
	});
	owner.host = host;
}

/** Returns the durable task owner registered for a framework host. */
export function taskOwnerForHost(host: object): TaskOwnerRecord | undefined {
	return (
		taskOwnersByHost.get(host) ??
		((host as { readonly [taskOwnerHost]?: TaskOwnerRecord })[taskOwnerHost] as
			| TaskOwnerRecord
			| undefined)
	);
}
