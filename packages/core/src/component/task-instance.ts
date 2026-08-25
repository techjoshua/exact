import type { ExactCompiledComponentContract } from '../component-contracts.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';
import { cleanupFailedComponentConstruction } from './construction.js';
import type {
	AnyComponentInstance,
	ComponentContextValues,
	ComponentFunction,
	ComponentInstance
} from './contracts.js';
import { CompactComponentInstance } from './compact-instance.js';
import { registerComponentRuntimeSurfaceTarget } from './runtime-surface-registration.js';
import {
	componentTaskCapability,
	type ComponentTaskCapability,
	type ComponentTaskCapabilityState
} from './task-capability.js';

/** Compact durable record for task-owning artifacts without lifecycle or list machinery. */
export class TaskComponentInstance<
	State extends object,
	Props extends Record<string, unknown>
> extends CompactComponentInstance<State, Props> {
	private readonly taskCapability: ComponentTaskCapability | undefined;
	private taskState: ComponentTaskCapabilityState | undefined;
	private taskReleased = false;

	constructor(
		type: ComponentFunction<State, Props>,
		rawProps: Props,
		parent: AnyComponentInstance | undefined,
		ambientContexts: ComponentContextValues | undefined,
		domain: ComponentInstance<State>['domain'],
		execution: PreparedComponentExecution | undefined,
		contract: ExactCompiledComponentContract
	) {
		super(type, rawProps, parent, ambientContexts, domain, contract);
		const capability = componentTaskCapability();
		if (!capability) {
			const error = new Error(
				'Task component construction requires the compiler-selected task capability'
			);
			cleanupFailedComponentConstruction(this, error);
			throw error;
		}
		this.taskCapability = capability;
		try {
			this.taskState = capability.create(
				this,
				type,
				contract,
				execution,
				rawProps,
				Boolean(this.componentResumption)
			);
			this.initializeComponent(() =>
				capability.run(this.taskState, () =>
					(contract.definition.instantiate as ComponentFunction<State, Props>).call(
						this,
						this.props as Props
					)
				)
			);
			if (this.componentResumption)
				capability.resume(this.taskState, new Set(this.componentResumption.settledContinuations));
			capability.retain(this.taskState, this);
		} catch (error) {
			cleanupFailedComponentConstruction(this, error);
			throw error;
		}
	}

	/** Releases task ownership in addition to the compact render scope exactly once. */
	override unmount(reason = 'unmount'): void {
		let primary: unknown;
		try {
			super.unmount(reason);
		} catch (error) {
			primary = error;
		}
		if (!this.taskReleased) {
			this.taskReleased = true;
			try {
				this.taskCapability?.release(this.taskState, this);
			} catch (error) {
				if (primary === undefined) primary = error;
			}
		}
		if (primary !== undefined) throw primary;
	}
}

registerComponentRuntimeSurfaceTarget(TaskComponentInstance.prototype);
