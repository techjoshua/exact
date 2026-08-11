import { deferTaskOwnerActivations, releaseTaskOwnerActivations } from '../tasks/activation.js';
import { componentContinuationTaskId } from '../tasks/component-continuation.js';
import { createTaskOwnerRecord, withTaskOwnerRecord } from '../tasks/frame-runtime.js';
import { releaseTaskObserver, retainTaskObserver } from '../tasks/observers.js';
import type { ComponentInstance } from './contracts.js';
import { configureComponentTaskOwner } from './task-owner-integration.js';
import {
	registerComponentTaskCapability,
	type ComponentTaskCapability,
	type ComponentTaskCapabilityState
} from './task-capability.js';

const taskCapability: ComponentTaskCapability = Object.freeze({
	create(instance, _type, contract, execution, props, resuming) {
		const required =
			contract === undefined ||
			contract.continuations.length !== 0 ||
			(contract.execution?.transitions.length ?? 0) !== 0 ||
			contract.definition?.capabilities.includes('tasks') === true ||
			contract.definition?.capabilities.includes('compatibility') === true;
		if (!required) return undefined;
		const owner = createTaskOwnerRecord(instance.id);
		if (resuming) deferTaskOwnerActivations(owner);
		return Object.freeze({
			owner,
			observer: configureComponentTaskOwner(instance, owner, execution, props)
		});
	},
	run<T>(state: ComponentTaskCapabilityState | undefined, operation: () => T): T {
		return state ? withTaskOwnerRecord(state.owner as never, operation) : operation();
	},
	resume(state: ComponentTaskCapabilityState | undefined, settled: ReadonlySet<string>): void {
		if (!state) return;
		releaseTaskOwnerActivations(state.owner as never, (task) => {
			const continuationId = componentContinuationTaskId(task);
			return continuationId !== undefined && settled.has(continuationId);
		});
	},
	retain(state: ComponentTaskCapabilityState | undefined, instance: ComponentInstance<any>): void {
		const observer = state?.observer as
			| { retain?(instance: ComponentInstance<any>): void }
			| undefined;
		observer?.retain?.(instance);
		if (observer?.retain) retainTaskObserver(instance, observer as never);
	},
	release(state: ComponentTaskCapabilityState | undefined, instance: ComponentInstance<any>): void {
		if (state)
			void (state.owner as { [Symbol.asyncDispose](): Promise<void> })[Symbol.asyncDispose]();
		releaseTaskObserver(instance);
	}
});

registerComponentTaskCapability(taskCapability);
