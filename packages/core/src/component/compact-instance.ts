import {
	createEffectScope,
	updateReactive,
	withEffectScope,
	type Reactive
} from '@exactjs/reactive/framework/runtime';
import type { ExactCompiledComponentContract } from '../component-contracts.js';
import { cleanupFailedComponentConstruction } from './construction.js';
import type {
	AnyComponentInstance,
	ComponentContextValues,
	ComponentFunction,
	ComponentInstance,
	ComponentResumptionActivation,
	RenderFunction
} from './contracts.js';
import { ErrorContext } from './contexts.js';
import {
	componentDomainInspection,
	isHydrationComponentDomain,
	resolveComponentResumption,
	withComponentDomain
} from './domain.js';
import { createErrorContext, createErrorReport, handleComponentError } from './errors.js';
import { allocateComponentInstanceId } from './instance-identity.js';
import { applyComponentResumption } from './resumption.js';
import { ComponentRuntimeSurface } from './runtime-surface.js';
import { createComponentProps, createComponentState } from './state.js';
import { compiledComponentCollectionsABI } from './compiled-abi.js';
import { optionalComponentContextCapability } from './context-capability.js';

/**
 * Compact durable record shared by compiler-selected render and task construction lanes.
 *
 * The record owns generated reactive work and the common component identity. Concrete lanes add
 * only the capability state their compiler artifact declares and must release it from `unmount`.
 */
export abstract class CompactComponentInstance<
		State extends object,
		Props extends Record<string, unknown>
	>
	extends ComponentRuntimeSurface<State>
	implements ComponentInstance<State>
{
	readonly type: ComponentFunction<State, Props>;
	parent?: AnyComponentInstance;
	readonly domain: ComponentInstance<State>['domain'];
	readonly id = allocateComponentInstanceId();
	readonly scope: ComponentInstance<State>['scope'];
	readonly state: Reactive<State>;
	readonly props: Reactive<Record<string, unknown>>;
	readonly ambientContexts?: ComponentContextValues;
	readonly runtimeABI: number;
	renderStop?: ComponentInstance<State>['renderStop'];
	invalidate?: () => void;
	errorFallback?: RenderFunction;

	private readonly inspection;
	private mountedValue = false;
	private activeValue = false;
	private disposedValue = false;
	private activityBlockers?: Set<symbol>;
	private renderFunctionValue: RenderFunction = () => null;
	protected readonly componentResumption: ComponentResumptionActivation | undefined;

	protected constructor(
		type: ComponentFunction<State, Props>,
		rawProps: Props,
		parent: AnyComponentInstance | undefined,
		ambientContexts: ComponentContextValues | undefined,
		domain: ComponentInstance<State>['domain'],
		contract: ExactCompiledComponentContract
	) {
		super();
		this.type = type;
		this.parent = parent;
		this.domain = domain;
		this.ambientContexts = ambientContexts;
		this.runtimeABI = contract.definition.abi;
		this.inspection = componentDomainInspection(domain);
		this.scope = createEffectScope(undefined, (error) => {
			handleComponentError(this, createErrorReport(error, 'reactive', this, 'watch'));
		});
		this.state = createComponentState<State>(
			domain,
			() => this,
			contract.definition.state,
			Boolean(this.runtimeABI & compiledComponentCollectionsABI)
		);
		this.props = createComponentProps(
			rawProps,
			contract.definition.props,
			Boolean(this.runtimeABI & compiledComponentCollectionsABI)
		);
		this.componentResumption = resolveComponentResumption(this.domain, this.type);
		if (this.componentResumption)
			applyComponentResumption(
				this.state as Reactive<Record<string, unknown>>,
				this.componentResumption
			);
	}

	/** Reports whether mount publication has completed and disposal has not begun. */
	get mounted(): boolean {
		return this.mountedValue;
	}

	/** Returns the compiler-produced render operation initialized for this record. */
	get renderFunction(): RenderFunction {
		return this.renderFunctionValue;
	}

	/** Opens a render pass; compact artifacts cannot own runtime-managed lists. */
	beginRender(): void {}

	/** Closes a render pass; compact artifacts cannot own runtime-managed lists. */
	endRender(): void {}

	/** Publishes the first mount and activates the record without lifecycle dispatch. */
	markMounted(): void {
		if (this.mountedValue || this.disposedValue) return;
		this.mountedValue = true;
		this.inspection?.publish({ kind: 'component.mount', component: this });
		this.handleMounted();
		this.updateActivation();
	}

	/** Applies one activity blocker without allocating lifecycle controllers or handler arrays. */
	setActivity(token: symbol, active: boolean, reason = 'activity'): void {
		if (active) {
			this.activityBlockers?.delete(token);
			if (!this.activityBlockers?.size) this.activityBlockers = undefined;
		} else (this.activityBlockers ??= new Set()).add(token);
		const blockers = this.activityBlockers?.size ?? 0;
		this.inspection?.publish({
			kind: 'activity.change',
			component: this,
			reason,
			attributes: Object.freeze({ active: blockers === 0, blockers })
		});
		this.updateActivation(reason);
	}

	/** Reconciles parent-owned inputs against the stable props facade. */
	updateProps(nextProps: Record<string, unknown>): void {
		updateReactive(this.props, nextProps);
		this.inspection?.publish({ kind: 'props.change', component: this, path: 'props' });
	}

	/** Releases generated reactive ownership and render invalidation exactly once. */
	unmount(reason = 'unmount'): void {
		if (this.disposedValue) return;
		this.inspection?.publish({ kind: 'component.unmount', component: this, reason });
		this.deactivate(reason);
		this.disposedValue = true;
		this.mountedValue = false;
		let primary: unknown;
		try {
			this.renderStop?.();
		} catch (error) {
			primary = error;
		}
		try {
			this.scope.stop();
		} catch (error) {
			if (primary === undefined) primary = error;
		}
		if (primary !== undefined) throw primary;
	}

	/** Runs one compiler-selected setup lane around shared construction and resumption semantics. */
	protected initializeComponent(invoke: () => RenderFunction): void {
		const resumption = this.componentResumption;
		try {
			this.inspection?.publish({ kind: 'component.construct', component: this });
			if (!this.parent && isHydrationComponentDomain(this.domain))
				this.inspection?.publish({ kind: 'hydration.activate', component: this });
			if (!this.parent) this.contexts.set(ErrorContext.id, createErrorContext());
			if (resumption && Object.keys(resumption.contexts).length !== 0) {
				const contextCapability = optionalComponentContextCapability();
				if (!contextCapability)
					throw new Error(
						'Component context resumption requires the compiler-selected context capability'
					);
				contextCapability.prepare(this, resumption);
			}

			const result = withEffectScope(this.scope, () => withComponentDomain(this.domain, invoke));
			if (resumption) {
				applyComponentResumption(this.state as Reactive<Record<string, unknown>>, resumption);
				this.inspection?.publish({ kind: 'resumption.activate', component: this });
			}
			if (typeof result !== 'function')
				throw new TypeError(
					'eXact runtime components must synchronously return their compiled render function'
				);
			this.renderFunctionValue = result;
		} catch (error) {
			cleanupFailedComponentConstruction(this, error);
			throw error;
		}
	}

	/** Runs capability-specific mount work before the common activation decision. */
	protected handleMounted(): void {}

	/** Publishes allocation-free activation state for inspection. */
	private updateActivation(reason = 'activity'): void {
		if (this.disposedValue || !this.mountedValue || this.activityBlockers?.size) {
			this.deactivate(reason);
			return;
		}
		this.activate(reason);
	}

	/** Publishes activation and reports whether this call changed state. */
	protected activate(reason: string): boolean {
		if (this.activeValue) return false;
		this.activeValue = true;
		this.inspection?.publish({ kind: 'component.activate', component: this, reason });
		return true;
	}

	/** Publishes deactivation and reports whether this call changed state. */
	protected deactivate(reason: string): boolean {
		if (!this.activeValue) return false;
		this.activeValue = false;
		this.inspection?.publish({ kind: 'component.deactivate', component: this, reason });
		return true;
	}
}
