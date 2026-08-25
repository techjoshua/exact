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
import { registerComponentRuntimeSurfaceTarget } from './runtime-surface-registration.js';
import { createComponentProps, createComponentState } from './state.js';
import { compiledComponentCollectionsABI } from './compiled-abi.js';
import { optionalComponentContextCapability } from './context-capability.js';

/**
 * Compact durable record for compiler artifacts that own no lifecycle, list, or task machinery.
 * Its effect scope owns generated bindings and reactive values; disposal releases that scope once.
 */
export class RenderComponentInstance<State extends object, Props extends Record<string, unknown>>
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

	constructor(
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
			Boolean(this.runtimeABI & compiledComponentCollectionsABI)
		);
		this.initialize(contract.definition.instantiate as ComponentFunction<State, Props>);
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

	/** Runs setup once and applies any state-only hydration resumption around authored defaults. */
	private initialize(instantiate: ComponentFunction<State, Props>): void {
		const resumption = resolveComponentResumption(this.domain, this.type);
		if (resumption)
			applyComponentResumption(this.state as Reactive<Record<string, unknown>>, resumption);
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

		let result: RenderFunction;
		try {
			result = withEffectScope(this.scope, () =>
				withComponentDomain(this.domain, () => instantiate.call(this, this.props as Props))
			);
		} catch (error) {
			cleanupFailedComponentConstruction(this, error);
			throw error;
		}
		if (resumption) {
			applyComponentResumption(this.state as Reactive<Record<string, unknown>>, resumption);
			this.inspection?.publish({ kind: 'resumption.activate', component: this });
		}
		if (typeof result !== 'function') {
			const error = new TypeError(
				'eXact runtime components must synchronously return their compiled render function'
			);
			cleanupFailedComponentConstruction(this, error);
			throw error;
		}
		this.renderFunctionValue = result;
	}

	/** Publishes allocation-free activation state for inspection. */
	private updateActivation(reason = 'activity'): void {
		if (this.disposedValue || !this.mountedValue || this.activityBlockers?.size) {
			this.deactivate(reason);
			return;
		}
		if (this.activeValue) return;
		this.activeValue = true;
		this.inspection?.publish({ kind: 'component.activate', component: this, reason });
	}

	/** Publishes compact deactivation without controller or handler work. */
	private deactivate(reason: string): void {
		if (!this.activeValue) return;
		this.activeValue = false;
		this.inspection?.publish({ kind: 'component.deactivate', component: this, reason });
	}
}

registerComponentRuntimeSurfaceTarget(RenderComponentInstance.prototype);
