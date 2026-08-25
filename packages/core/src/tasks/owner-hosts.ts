import type { TaskOwnerRecord } from './frame-runtime.js';

const taskOwnerHost = Symbol.for('@exactjs/task-owner-host');

/** Associates a durable framework host with its task owner. */
export function registerTaskOwnerHost(host: object, owner: TaskOwnerRecord): void {
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
	return (host as { readonly [taskOwnerHost]?: TaskOwnerRecord })[taskOwnerHost];
}
