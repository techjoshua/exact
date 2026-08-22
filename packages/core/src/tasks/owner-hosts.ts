import type { TaskOwnerRecord } from './frame-runtime.js';

const taskOwnerHost = Symbol.for('@exactjs/task-owner-host');
const taskOwnersByHost = new WeakMap<object, TaskOwnerRecord>();
const taskOwnerProvidersByHost = new WeakMap<object, TaskOwnerHostProvider>();

/** Materializes a durable task owner only when a host first needs structural task work. */
export type TaskOwnerHostProvider = {
	materializeTaskOwner(): TaskOwnerRecord;
};

/** Associates a durable framework host with its task owner. */
export function registerTaskOwnerHost(host: object, owner: TaskOwnerRecord): void {
	taskOwnerProvidersByHost.delete(host);
	taskOwnersByHost.set(host, owner);
	Object.defineProperty(host, taskOwnerHost, {
		value: owner,
		configurable: true,
		enumerable: false,
		writable: false
	});
	owner.host = host;
}

/** Associates a host with an allocation-on-demand task owner provider. */
export function registerTaskOwnerHostProvider(host: object, provider: TaskOwnerHostProvider): void {
	taskOwnerProvidersByHost.set(host, provider);
	Object.defineProperty(host, taskOwnerHost, {
		get: materializeRegisteredTaskOwner,
		configurable: true,
		enumerable: false
	});
}

function materializeRegisteredTaskOwner(this: object): TaskOwnerRecord | undefined {
	return taskOwnerProvidersByHost.get(this)?.materializeTaskOwner();
}

/** Removes an unmaterialized provider when its host lifetime ends. */
export function releaseTaskOwnerHostProvider(host: object, provider: TaskOwnerHostProvider): void {
	if (taskOwnerProvidersByHost.get(host) !== provider) return;
	taskOwnerProvidersByHost.delete(host);
	if (!taskOwnersByHost.has(host))
		delete (host as { [taskOwnerHost]?: TaskOwnerRecord })[taskOwnerHost];
}

/** Returns an already materialized owner without invoking a lazy provider. */
export function peekTaskOwnerForHost(host: object): TaskOwnerRecord | undefined {
	return taskOwnersByHost.get(host);
}

/** Returns the durable task owner registered for a framework host. */
export function taskOwnerForHost(host: object): TaskOwnerRecord | undefined {
	return (
		taskOwnersByHost.get(host) ??
		taskOwnerProvidersByHost.get(host)?.materializeTaskOwner() ??
		((host as { readonly [taskOwnerHost]?: TaskOwnerRecord })[taskOwnerHost] as
			| TaskOwnerRecord
			| undefined)
	);
}
