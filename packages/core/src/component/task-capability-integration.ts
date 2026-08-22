import { deferTaskOwnerActivations, releaseTaskOwnerActivations } from '../tasks/activation.js';
import { componentContinuationTaskId } from '../tasks/component-continuation.js';
import { createTaskOwnerRecord, withTaskOwnerRecord } from '../tasks/frame-runtime.js';
import { releaseTaskObserver, retainTaskObserver } from '../tasks/observers.js';
import {
	registerTaskOwnerHostProvider,
	releaseTaskOwnerHostProvider,
	type TaskOwnerHostProvider
} from '../tasks/owner-hosts.js';
import type { AnyComponentInstance } from './contracts.js';
import {
	configureComponentTaskOwner,
	configureInteractionTaskOwner
} from './task-owner-integration.js';
import {
	registerComponentTaskCapability,
	type ComponentTaskCapability,
	type ComponentTaskCapabilityState
} from './task-capability.js';

const taskCapability: ComponentTaskCapability = Object.freeze({
	create(instance, _type, contract, execution, props, resuming) {
		const eager =
			contract === undefined ||
			contract.continuations.length !== 0 ||
			(contract.execution?.transitions.length ?? 0) !== 0 ||
			contract.definition?.capabilities.includes('tasks') === true ||
			contract.definition?.capabilities.includes('compatibility') === true;
		if (!eager && contract?.definition?.capabilities.includes('interactions') === true && !resuming)
			return new LazyInteractionTaskState(instance);
		if (!eager) return undefined;
		const owner = createTaskOwnerRecord(instance.id);
		if (resuming) deferTaskOwnerActivations(owner);
		return Object.freeze({
			owner,
			observer: configureComponentTaskOwner(instance, owner, execution, props)
		});
	},
	run<T>(state: ComponentTaskCapabilityState | undefined, operation: () => T): T {
		return state?.owner ? withTaskOwnerRecord(state.owner as never, operation) : operation();
	},
	resume(state: ComponentTaskCapabilityState | undefined, settled: ReadonlySet<string>): void {
		if (!state?.owner) return;
		releaseTaskOwnerActivations(state.owner as never, (task) => {
			const continuationId = componentContinuationTaskId(task);
			return continuationId !== undefined && settled.has(continuationId);
		});
	},
	retain(state: ComponentTaskCapabilityState | undefined, instance: AnyComponentInstance): void {
		if (state instanceof LazyInteractionTaskState) state.retained = true;
		const observer = state?.observer as
			| { retain?(instance: AnyComponentInstance): void }
			| undefined;
		observer?.retain?.(instance);
		if (observer?.retain) retainTaskObserver(instance, observer as never);
	},
	release(state: ComponentTaskCapabilityState | undefined, instance: AnyComponentInstance): void {
		if (state instanceof LazyInteractionTaskState) state.release();
		else if (state?.owner)
			void (state.owner as { [Symbol.asyncDispose](): Promise<void> })[Symbol.asyncDispose]();
		releaseTaskObserver(instance);
	}
});

class LazyInteractionTaskState implements ComponentTaskCapabilityState, TaskOwnerHostProvider {
	owner?: ReturnType<typeof createTaskOwnerRecord>;
	observer?: ReturnType<typeof configureInteractionTaskOwner>;
	retained = false;
	private released = false;

	constructor(private readonly instance: AnyComponentInstance) {
		registerTaskOwnerHostProvider(instance, this);
	}

	materializeTaskOwner(): ReturnType<typeof createTaskOwnerRecord> {
		if (this.owner) return this.owner;
		if (this.released) throw new Error('Component task owner has been released');
		const owner = createTaskOwnerRecord(this.instance.id);
		this.owner = owner;
		this.observer = configureInteractionTaskOwner(this.instance, owner);
		if (this.retained && this.observer?.retain) {
			this.observer.retain(this.instance);
			retainTaskObserver(this.instance, this.observer);
		}
		return owner;
	}

	release(): void {
		if (this.released) return;
		this.released = true;
		releaseTaskOwnerHostProvider(this.instance, this);
		if (this.owner) void this.owner[Symbol.asyncDispose]();
	}
}

registerComponentTaskCapability(taskCapability);
