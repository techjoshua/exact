import {
	createEffectScope,
	updateReactive,
	withEffectScope,
	type Reactive,
	type ReactiveValue
} from '@exactjs/reactive/framework/runtime';
import { observeLifecyclePromise } from './async.js';
import { isPromiseLike } from './async-value.js';
import {
	componentContextCapability,
	optionalComponentContextCapability
} from './context-capability.js';
import type {
	AnyComponentInstance,
	ComponentContextValues,
	ComponentFunction,
	ComponentInstance,
	ContextToken,
	LifecycleHandler,
	RefBinding,
	RefKey,
	RefRegistry,
	RenderEventHandler,
	RenderFunction,
	VNode
} from './contracts.js';
import { cleanupFailedComponentConstruction } from './construction.js';
import { ErrorContext } from './contexts.js';
import {
	componentDomainInspection,
	isHydrationComponentDomain,
	resolveComponentResumption,
	withComponentDomain
} from './domain.js';
import { createErrorContext, createErrorReport, handleComponentError } from './errors.js';
import {
	clearComponentLifecycleHandlers,
	componentLifecycleHandlers,
	mutableComponentLifecycleHandlers,
	mutableComponentRenderHandlers
} from './lifecycle-handlers.js';
import { componentListCapability, optionalComponentListCapability } from './list-capability.js';
import { componentLocalizationCapability } from './localization-capability.js';
import { createComponentLog } from './log.js';
import { componentTaskCapability, type ComponentTaskCapabilityState } from './task-capability.js';
import type { IntlFacade } from '../localization/contracts.js';
import type { ComponentLog } from '../logging.js';
import { componentRefCapability } from './ref-capability.js';
import { createComponentReactive } from './reactive-expression.js';
import { applyComponentResumption } from './resumption.js';
import { disposeComponentResource } from './resource-ownership.js';
import { createComponentProps, createComponentState } from './state.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';
import { type ExactComponentContract } from '../component-contracts.js';
export { reparentComponentInstance } from './ownership.js';

let nextComponentId = 1;

/** Shared-prototype implementation of one durable component instance. */
export class ComponentInstanceImpl<State extends object, Props extends Record<string, unknown>>
	implements ComponentInstance<State>
{
	readonly type: ComponentFunction<State, Props>;
	parent?: AnyComponentInstance;
	readonly domain: ComponentInstance<State>['domain'];
	readonly id: string;
	readonly scope: ComponentInstance<State>['scope'];
	readonly state: Reactive<State>;
	readonly props: Reactive<Record<string, unknown>>;
	readonly ambientContexts?: ComponentContextValues;
	private logValue?: ComponentLog;
	renderStop?: ComponentInstance<State>['renderStop'];
	mountController?: AbortController;
	activationController?: AbortController;
	invalidate?: () => void;
	errorFallback?: RenderFunction;

	private contextsValue?: Map<symbol, unknown>;
	private contextTokensValue?: Map<symbol, ContextToken<unknown>>;
	private intlFacade?: IntlFacade;
	private readonly inspection;
	private readonly taskCapability = componentTaskCapability();
	private taskState?: ComponentTaskCapabilityState;
	private activeValue = false;
	private activityBlockers?: Set<symbol>;
	private mountedValue = false;
	private disposedValue = false;
	private renderFunctionValue: RenderFunction = () => null;

	constructor(
		type: ComponentFunction<State, Props>,
		instantiate: ComponentFunction<State, Props>,
		rawProps: Props,
		parent: AnyComponentInstance | undefined,
		ambientContexts: ComponentContextValues | undefined,
		domain: ComponentInstance<State>['domain'],
		execution?: PreparedComponentExecution,
		contract?: ExactComponentContract
	) {
		this.type = type;
		this.parent = parent;
		this.domain = domain;
		this.ambientContexts = ambientContexts;
		this.id = `c${nextComponentId++}`;
		this.inspection = componentDomainInspection(domain);
		this.scope = createEffectScope(undefined, (error) => {
			handleComponentError(this, createErrorReport(error, 'reactive', this, 'watch'));
		});
		this.state = createComponentState<State>(
			domain,
			() => this,
			contract?.definition?.state,
			contract?.definition?.capabilities.includes('collections') === true
		);
		this.props = createComponentProps(
			rawProps,
			contract?.definition?.capabilities.includes('collections') === true
		);
		this.initialize(instantiate, execution, rawProps, contract);
	}

	/** Returns the lazily allocated local context value map owned by this instance. */
	get contexts(): Map<symbol, unknown> {
		return (this.contextsValue ??= new Map());
	}

	/** Returns the lazily allocated component logger shared by every call from this instance. */
	get log(): ComponentLog {
		return (this.logValue ??= createComponentLog(this));
	}

	/** Returns the lazily allocated token catalog used for inspection and resumption. */
	get contextTokens(): Map<symbol, ContextToken<unknown>> {
		return (this.contextTokensValue ??= new Map());
	}

	/** Reports whether mount publication has completed and unmount has not begun. */
	get mounted(): boolean {
		return this.mountedValue;
	}

	/** Returns the durable render function produced during component construction. */
	get renderFunction(): RenderFunction {
		return this.renderFunctionValue;
	}

	/** Returns the compiler-selected ref registry, allocating its capability state lazily. */
	get refs(): RefRegistry {
		return componentRefCapability().registry(this);
	}

	/** Returns the lazy localization facade or fails when the artifact omitted that capability. */
	get intl(): IntlFacade {
		const capability = componentLocalizationCapability();
		if (!capability)
			throw new Error(
				'Component localization is unavailable because this artifact did not include the localization capability'
			);
		return (this.intlFacade ??= capability.create(this));
	}

	/** Returns the mutable mount-handler lane retained by the lifecycle capability. */
	get mountHandlers(): LifecycleHandler[] {
		return mutableComponentLifecycleHandlers(this, 'mount');
	}

	/** Returns the mutable activation-handler lane retained by the lifecycle capability. */
	get activateHandlers(): LifecycleHandler[] {
		return mutableComponentLifecycleHandlers(this, 'activate');
	}

	/** Returns the mutable deactivation-handler lane retained by the lifecycle capability. */
	get deactivateHandlers(): LifecycleHandler[] {
		return mutableComponentLifecycleHandlers(this, 'deactivate');
	}

	/** Returns the mutable unmount-handler lane retained by the lifecycle capability. */
	get unmountHandlers(): LifecycleHandler[] {
		return mutableComponentLifecycleHandlers(this, 'unmount');
	}

	/** Returns the mutable post-render handler lane retained by the lifecycle capability. */
	get renderHandlers(): RenderEventHandler[] {
		return mutableComponentRenderHandlers(this);
	}

	/** Transfers a disposable resource to this component's unmount lifetime. */
	own<T extends Disposable | AsyncDisposable | { dispose(): unknown }>(resource: T): T {
		this.onUnmount(() => disposeComponentResource(resource));
		return resource;
	}

	/** Opens compiler-selected list bookkeeping for one render pass when lists are present. */
	beginRender(): void {
		optionalComponentListCapability()?.begin(this);
	}

	/** Closes compiler-selected list bookkeeping and releases entries absent from this pass. */
	endRender(): void {
		optionalComponentListCapability()?.end(this);
	}

	/** Reports whether a token is available while publishing its read for inspection. */
	hasContext(token: ContextToken<unknown>): boolean {
		this.contextTokens.set(token.id, token);
		const capability = componentContextCapability();
		capability.publish(this, token, 'read');
		return capability.has(this, this.ambientContexts, token);
	}

	/** Reads one reactive context value and records the compiler-observable dependency. */
	getContext<T>(token: ContextToken<T>): Reactive<T> {
		this.contextTokens.set(token.id, token);
		const capability = componentContextCapability();
		capability.publish(this, token, 'read');
		return capability.get(this, this.ambientContexts, token);
	}

	/** Publishes one descendant context value owned by this durable instance. */
	setContext<T>(token: ContextToken<T>, value: T): void {
		this.contextTokens.set(token.id, token);
		const capability = componentContextCapability();
		capability.set(this, token, value);
		capability.publish(this, token, 'write');
	}

	/** Creates an explicitly reactive value or tagged expression owned by the current scope. */
	reactive<T>(
		input: TemplateStringsArray | (() => T) | T,
		...values: unknown[]
	): ReactiveValue<string> | ReactiveValue<T> {
		return createComponentReactive(input, values);
	}

	/** Creates a typed ref binding in the compiler-selected ref capability. */
	ref<T>(key: RefKey<T>): RefBinding<T> {
		return componentRefCapability().ref(this, key);
	}

	/** Reads the current value of a typed ref without changing its ownership. */
	readRef<T>(key: RefKey<T>): T | undefined {
		return componentRefCapability().read(this, key);
	}

	/** Creates a keyed list VNode whose identity and cleanup belong to this component. */
	map<T>(
		collection: Iterable<T> | ReactiveValue<Iterable<T>>,
		key: (item: T) => string,
		render: (item: T) => VNode,
		id?: string,
		provenance?: Iterable<T>,
		keyIdentity?: string
	): VNode {
		return componentListCapability().map(
			this,
			collection,
			key,
			render,
			id,
			provenance,
			keyIdentity
		);
	}

	/** Registers work to run once after this instance first mounts. */
	onMount(handler: LifecycleHandler): void {
		mutableComponentLifecycleHandlers(this, 'mount').push(handler);
	}

	/** Registers work for each transition into the active component state. */
	onActivate(handler: LifecycleHandler): void {
		mutableComponentLifecycleHandlers(this, 'activate').push(handler);
	}

	/** Registers work for each transition out of the active component state. */
	onDeactivate(handler: LifecycleHandler): void {
		mutableComponentLifecycleHandlers(this, 'deactivate').push(handler);
	}

	/** Registers final cleanup that runs when the durable instance is disposed. */
	onUnmount(handler: LifecycleHandler): void {
		mutableComponentLifecycleHandlers(this, 'unmount').push(handler);
	}

	/** Registers work that runs after a committed render publication. */
	onRender(handler: RenderEventHandler): void {
		mutableComponentRenderHandlers(this).push(handler);
	}

	/** Publishes first mount, runs mount handlers, and derives initial activation. */
	markMounted(): void {
		if (this.mountedValue || this.disposedValue) return;
		this.mountedValue = true;
		this.inspection?.publish({ kind: 'component.mount', component: this });
		const handlers = componentLifecycleHandlers(this, 'mount');
		this.mountController = handlers.length ? new AbortController() : undefined;
		for (const handler of handlers) {
			if (this.disposedValue || !this.mountedValue) break;
			try {
				const result = handler({ signal: this.mountController!.signal });
				if (isPromiseLike(result)) observeLifecyclePromise(this, Promise.resolve(result), 'mount');
			} catch (error) {
				handleComponentError(this, createErrorReport(error, 'lifecycle', this, 'mount'));
			}
		}
		this.updateActivation();
	}

	/** Adds or removes one activity blocker and publishes the resulting active state. */
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

	/** Applies parent-owned prop changes to the existing reactive prop identity. */
	updateProps(nextProps: Record<string, unknown>): void {
		updateReactive(this.props, nextProps);
		this.inspection?.publish({ kind: 'props.change', component: this, path: 'props' });
	}

	/** Disposes every owned scope, task, list, handler, and controller exactly once. */
	unmount(reason = 'unmount'): void {
		if (this.disposedValue) return;
		this.inspection?.publish({ kind: 'component.unmount', component: this, reason });
		this.deactivate(reason);
		this.disposedValue = true;
		this.mountedValue = false;
		let failed = false;
		let firstError: unknown;
		const teardown = (run: () => void) => {
			try {
				run();
			} catch (error) {
				if (!failed) firstError = error;
				failed = true;
			}
		};
		if (this.renderStop) teardown(this.renderStop);
		teardown(() => this.scope.stop());
		teardown(() => optionalComponentListCapability()?.dispose(this));
		if (this.mountController) teardown(() => this.mountController!.abort(reason));
		if (this.taskState) teardown(() => this.taskCapability?.release(this.taskState, this));
		for (const handler of componentLifecycleHandlers(this, 'unmount')) {
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
		clearComponentLifecycleHandlers(this);
		if (failed) throw firstError;
	}

	private initialize(
		instantiate: ComponentFunction<State, Props>,
		execution: PreparedComponentExecution | undefined,
		rawProps: Props,
		contract: ExactComponentContract | undefined
	): void {
		const resumption = resolveComponentResumption(this.domain, this.type);
		if (resumption) {
			applyComponentResumption(this.state as Reactive<Record<string, unknown>>, resumption);
		}
		this.taskState = this.taskCapability?.create(
			this,
			this.type,
			contract,
			execution,
			rawProps,
			Boolean(resumption)
		);
		this.inspection?.publish({ kind: 'component.construct', component: this });
		if (!this.parent && isHydrationComponentDomain(this.domain))
			this.inspection?.publish({ kind: 'hydration.activate', component: this });
		if (!this.parent) this.contexts.set(ErrorContext.id, createErrorContext());
		if (resumption) {
			const contextCapability = optionalComponentContextCapability();
			if (Object.keys(resumption.contexts).length !== 0 && !contextCapability)
				throw new Error(
					'Component context resumption requires the compiler-selected context capability'
				);
			contextCapability?.prepare(this, resumption);
		}

		let result: RenderFunction;
		try {
			result = withEffectScope(this.scope, () =>
				withComponentDomain(this.domain, () =>
					this.taskCapability
						? this.taskCapability.run(this.taskState, () =>
								instantiate.call(this, this.props as Props)
							)
						: instantiate.call(this, this.props as Props)
				)
			);
		} catch (error) {
			cleanupFailedComponentConstruction(this, error);
			throw error;
		}
		if (resumption) {
			applyComponentResumption(this.state as Reactive<Record<string, unknown>>, resumption);
			this.inspection?.publish({ kind: 'resumption.activate', component: this });
			const settledContinuations = new Set(resumption.settledContinuations);
			this.taskCapability?.resume(this.taskState, settledContinuations);
		}
		if (typeof result !== 'function') {
			const error = new TypeError(
				'eXact runtime components must synchronously return their compiled render function'
			);
			cleanupFailedComponentConstruction(this, error);
			throw error;
		}
		this.renderFunctionValue = result;
		this.taskCapability?.retain(this.taskState, this);
	}

	/** Advances the allocation-free activity state kept directly on the component record. */
	private updateActivation(reason = 'activity'): void {
		if (this.disposedValue || !this.mountedValue || this.activityBlockers?.size) {
			this.deactivate(reason);
			return;
		}
		if (this.activeValue) return;
		this.activeValue = true;
		this.inspection?.publish({ kind: 'component.activate', component: this, reason });
		const handlers = componentLifecycleHandlers(this, 'activate');
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
	}

	/** Deactivates the component without allocating a per-instance state-machine closure. */
	private deactivate(reason: string): void {
		if (!this.activeValue) return;
		this.activeValue = false;
		this.inspection?.publish({ kind: 'component.deactivate', component: this, reason });
		this.activationController?.abort(reason);
		this.activationController = undefined;
		for (const handler of componentLifecycleHandlers(this, 'deactivate')) {
			try {
				const result = handler({ signal: AbortSignal.abort(reason), reason });
				if (isPromiseLike(result))
					observeLifecyclePromise(this, Promise.resolve(result), 'deactivate');
			} catch (error) {
				handleComponentError(this, createErrorReport(error, 'lifecycle', this, 'deactivate'));
			}
		}
	}
}

export {
	createComponentInstance,
	createFrameworkFixtureComponentInstance,
	createPreparedComponentInstance
} from './runtime-construction.js';
