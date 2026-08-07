import {
	taskOwnerBrand,
	type TaskActivationRegistration,
	type TaskFrameCleanup,
	type TaskFrameRecord,
	type TaskOwnerRecord
} from './frame-contracts.js';
import { waitForTaskFrameSettlement } from './frame-settlement.js';

class TaskOwnerRecordImpl implements TaskOwnerRecord {
	readonly [taskOwnerBrand] = true;
	readonly label?: string;
	host?: object;
	observeSettlement?: (settlement: Promise<unknown>) => void;
	registerReadiness?: TaskOwnerRecord['registerReadiness'];
	activationsDeferred = false;
	disposed = false;
	private controllerValue?: AbortController;
	private framesValue?: Set<TaskFrameRecord>;
	private settlementsValue?: Set<PromiseLike<unknown>>;
	private ownerCleanupsValue?: Set<TaskFrameCleanup>;
	private activationRegistrationsValue?: Set<TaskActivationRegistration>;

	constructor(label?: string) {
		this.label = label;
	}

	get controller(): AbortController {
		if (!this.controllerValue) {
			this.controllerValue = new AbortController();
			if (this.disposed) this.controllerValue.abort('task-owner-disposed');
		}
		return this.controllerValue;
	}

	get signal(): AbortSignal {
		return this.controller.signal;
	}

	get frames(): Set<TaskFrameRecord> {
		return (this.framesValue ??= new Set());
	}

	get settlements(): Set<PromiseLike<unknown>> {
		return (this.settlementsValue ??= new Set());
	}

	get ownerCleanups(): Set<TaskFrameCleanup> {
		return (this.ownerCleanupsValue ??= new Set());
	}

	get activationRegistrations(): Set<TaskActivationRegistration> {
		return (this.activationRegistrationsValue ??= new Set());
	}

	async [Symbol.asyncDispose](): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.controllerValue?.abort('task-owner-disposed');
		for (const frame of this.framesValue ?? []) frame.controller.abort('task-owner-disposed');
		for (const cleanup of [...(this.ownerCleanupsValue ?? [])].reverse()) await cleanup();
		this.ownerCleanupsValue?.clear();
		await Promise.allSettled([
			...[...(this.framesValue ?? [])].map(waitForTaskFrameSettlement),
			...(this.settlementsValue ?? [])
		]);
	}
}

/** Creates a task owner whose cancellation and collection storage is materialized on first use. */
export function createLazyTaskOwnerRecord(label?: string): TaskOwnerRecord {
	return new TaskOwnerRecordImpl(label);
}
