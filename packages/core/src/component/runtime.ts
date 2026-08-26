import { observeLifecyclePromise } from './async.js';
import { isPromiseLike } from './async-value.js';
import type {
	AnyComponentInstance,
	ComponentContextValues,
	ComponentFunction,
	ComponentInstance
} from './contracts.js';
import { cleanupFailedComponentConstruction } from './construction.js';
import { createErrorReport, handleComponentError } from './errors.js';
import {
	clearComponentLifecycleHandlers,
	componentLifecycleHandlers
} from './lifecycle-handlers.js';
import { optionalComponentListCapability } from './list-capability.js';
import {
	componentTaskCapability,
	type ComponentTaskCapability,
	type ComponentTaskCapabilityState
} from './task-capability.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';
import type { ExactCompiledComponentContract } from '../component-contracts.js';
import {
	compiledComponentLifecycleABI,
	compiledComponentListsABI,
	compiledComponentTasksABI
} from './compiled-abi.js';
import { CompactComponentInstance } from './compact-instance.js';
import { registerComponentRuntimeSurfaceTarget } from './runtime-surface-registration.js';
export { reparentComponentInstance } from './ownership.js';

/**
 * Compiler-selected component record for artifacts that own lifecycle or list machinery.
 *
 * Common identity, state, props, render, activation, and reactive disposal live in the compact
 * base. This lane allocates and executes only the durable capability hooks declared by its ABI.
 */
export class ComponentInstanceImpl<
	State extends object,
	Props extends Record<string, unknown>
> extends CompactComponentInstance<State, Props> {
	mountController?: AbortController;
	activationController?: AbortController;

	private readonly taskCapability: ComponentTaskCapability | undefined;
	private taskState?: ComponentTaskCapabilityState;
	private durableReleased = false;

	constructor(
		type: ComponentFunction<State, Props>,
		instantiate: ComponentFunction<State, Props>,
		rawProps: Props,
		parent: AnyComponentInstance | undefined,
		ambientContexts: ComponentContextValues | undefined,
		domain: ComponentInstance<State>['domain'],
		execution: PreparedComponentExecution | undefined,
		contract: ExactCompiledComponentContract
	) {
		super(type, rawProps, parent, ambientContexts, domain, contract);
		this.taskCapability =
			this.runtimeABI & compiledComponentTasksABI ? componentTaskCapability() : undefined;
		if (this.runtimeABI & compiledComponentTasksABI && !this.taskCapability) {
			const error = new Error(
				'Durable task component construction requires the compiler-selected task capability'
			);
			cleanupFailedComponentConstruction(this, error);
			throw error;
		}

		try {
			this.taskState = this.taskCapability?.create(
				this,
				type,
				contract,
				execution,
				rawProps,
				Boolean(this.componentResumption)
			);
			this.initializeComponent(() =>
				this.taskCapability
					? this.taskCapability.run(this.taskState, () =>
							instantiate.call(this, this.props as Props)
						)
					: instantiate.call(this, this.props as Props)
			);
			if (this.componentResumption)
				this.taskCapability?.resume(
					this.taskState,
					new Set(this.componentResumption.settledContinuations)
				);
			this.taskCapability?.retain(this.taskState, this);
		} catch (error) {
			cleanupFailedComponentConstruction(this, error);
			throw error;
		}
	}

	/** Opens compiler-selected list bookkeeping for one render pass when lists are present. */
	override beginRender(): void {
		if (this.runtimeABI & compiledComponentListsABI) optionalComponentListCapability()?.begin(this);
	}

	/** Closes compiler-selected list bookkeeping and releases entries absent from this pass. */
	override endRender(): void {
		if (this.runtimeABI & compiledComponentListsABI) optionalComponentListCapability()?.end(this);
	}

	/** Releases list, lifecycle, and task ownership after common reactive disposal. */
	override unmount(reason = 'unmount'): void {
		let primary: unknown;
		try {
			super.unmount(reason);
		} catch (error) {
			primary = error;
		}
		if (!this.durableReleased) {
			this.durableReleased = true;
			const teardown = (run: () => void) => {
				try {
					run();
				} catch (error) {
					if (primary === undefined) primary = error;
				}
			};
			if (this.runtimeABI & compiledComponentListsABI)
				teardown(() => optionalComponentListCapability()?.dispose(this));
			if (this.mountController) teardown(() => this.mountController!.abort(reason));
			if (this.taskState) teardown(() => this.taskCapability?.release(this.taskState, this));
			const unmountHandlers =
				this.runtimeABI & compiledComponentLifecycleABI
					? componentLifecycleHandlers(this, 'unmount')
					: [];
			for (const handler of unmountHandlers) {
				try {
					const result = handler({ signal: AbortSignal.abort(reason), reason });
					if (isPromiseLike(result))
						observeLifecyclePromise(this, Promise.resolve(result), 'unmount');
				} catch (error) {
					teardown(() =>
						handleComponentError(this, createErrorReport(error, 'lifecycle', this, 'unmount'))
					);
				}
			}
			if (this.runtimeABI & compiledComponentLifecycleABI) clearComponentLifecycleHandlers(this);
		}
		if (primary !== undefined) throw primary;
	}

	/** Runs mount handlers before the compact record makes its initial activation decision. */
	protected override handleMounted(): void {
		const handlers =
			this.runtimeABI & compiledComponentLifecycleABI
				? componentLifecycleHandlers(this, 'mount')
				: [];
		this.mountController = handlers.length ? new AbortController() : undefined;
		for (const handler of handlers) {
			if (!this.mounted) break;
			try {
				const result = handler({ signal: this.mountController!.signal });
				if (isPromiseLike(result)) observeLifecyclePromise(this, Promise.resolve(result), 'mount');
			} catch (error) {
				handleComponentError(this, createErrorReport(error, 'lifecycle', this, 'mount'));
			}
		}
	}

	/** Activates the compact record and then dispatches compiler-selected lifecycle work. */
	protected override activate(reason: string): boolean {
		if (!super.activate(reason)) return false;
		const handlers =
			this.runtimeABI & compiledComponentLifecycleABI
				? componentLifecycleHandlers(this, 'activate')
				: [];
		this.activationController = handlers.length ? new AbortController() : undefined;
		for (const handler of handlers) {
			try {
				const result = handler({ signal: this.activationController!.signal });
				if (isPromiseLike(result))
					observeLifecyclePromise(this, Promise.resolve(result), 'activate');
			} catch (error) {
				handleComponentError(this, createErrorReport(error, 'lifecycle', this, 'activate'));
			}
		}
		return true;
	}

	/** Deactivates the compact record, aborts activation work, and dispatches handlers. */
	protected override deactivate(reason: string): boolean {
		if (!super.deactivate(reason)) return false;
		this.activationController?.abort(reason);
		this.activationController = undefined;
		const handlers =
			this.runtimeABI & compiledComponentLifecycleABI
				? componentLifecycleHandlers(this, 'deactivate')
				: [];
		for (const handler of handlers) {
			try {
				const result = handler({ signal: AbortSignal.abort(reason), reason });
				if (isPromiseLike(result))
					observeLifecyclePromise(this, Promise.resolve(result), 'deactivate');
			} catch (error) {
				handleComponentError(this, createErrorReport(error, 'lifecycle', this, 'deactivate'));
			}
		}
		return true;
	}
}

registerComponentRuntimeSurfaceTarget(ComponentInstanceImpl.prototype);

export {
	createComponentInstance,
	createFrameworkFixtureComponentInstance,
	createPreparedComponentInstance
} from './runtime-construction.js';
