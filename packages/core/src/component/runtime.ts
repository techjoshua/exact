import {
	computed,
	createEffectScope,
	unwrap,
	updateReactive,
	withEffectScope,
	type Reactive,
	type ReactiveValue
} from '@exactjs/reactive';
import { deferTaskOwnerActivations, releaseTaskOwnerActivations } from '../tasks/activation.js';
import { componentContinuationTaskId } from '../tasks/component-continuation.js';
import { createTaskOwnerRecord, withTaskOwnerRecord } from '../tasks/frame-runtime.js';
import { releaseTaskObserver, retainTaskObserver, taskObserverFor } from '../tasks/observers.js';
import { registerTaskOwnerHost } from '../tasks/owner-hosts.js';
import { createComponentActivation, type ComponentActivation } from './activation.js';
import { observeLifecyclePromise } from './async.js';
import { isPromiseLike } from './async-value.js';
import { getComponentContext, hasComponentContext, setComponentContext } from './context-api.js';
import { publishContextAccess } from './context-inspection.js';
import { prepareComponentContextResumption } from './context-resumption.js';
import type {
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
import { cleanupFailedComponentConstruction, isTemplateStringsArray } from './construction.js';
import { ErrorContext } from './contexts.js';
import {
	componentDomainInspection,
	isHydrationComponentDomain,
	pageComponentDomain,
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
import { createComponentListController } from './list-controller.js';
import { createNoopComponentLog } from './log.js';
import { applyInternalPlugins } from './plugins.js';
import { componentReadinessContext } from './readiness.js';
import { reactiveValue } from './reactive-value.js';
import { createComponentIntlFacade } from '../localization/facade.js';
import type { IntlFacade } from '../localization/contracts.js';
import { createComponentRefBinding, createComponentRefRegistry } from './ref-runtime.js';
import { applyComponentResumption } from './resumption.js';
import { createComponentProps, createComponentState } from './state.js';
export { reparentComponentInstance } from './ownership.js';

let nextComponentId = 1;

/** Shared-prototype implementation of one durable component instance. */
class ComponentInstanceImpl<State extends object, Props extends Record<string, unknown>>
	implements ComponentInstance<State>
{
	readonly type: ComponentFunction<State, Props>;
	parent?: ComponentInstance<any>;
	readonly domain: ComponentInstance<State>['domain'];
	readonly id: string;
	readonly scope: ComponentInstance<State>['scope'];
	readonly state: Reactive<State>;
	readonly props: Reactive<Record<string, unknown>>;
	readonly ambientContexts?: ComponentContextValues;
	log = createNoopComponentLog();
	renderStop?: ComponentInstance<State>['renderStop'];
	mountController?: AbortController;
	activationController?: AbortController;
	invalidate?: () => void;
	errorFallback?: RenderFunction;

	private contextsValue?: Map<symbol, unknown>;
	private contextTokensValue?: Map<symbol, ContextToken<unknown>>;
	private refsValue?: Map<symbol, RefBinding<unknown>>;
	private refsRegistry?: RefRegistry;
	private lists?: ReturnType<typeof createComponentListController>;
	private intlFacade?: IntlFacade;
	private readonly inspection;
	private readonly taskOwner;
	private readonly activation: ComponentActivation;
	private activityBlockers?: Set<symbol>;
	private mountedValue = false;
	private disposedValue = false;
	private renderFunctionValue: RenderFunction = () => null;

	constructor(
		type: ComponentFunction<State, Props>,
		rawProps: Props,
		parent: ComponentInstance<any> | undefined,
		ambientContexts: ComponentContextValues | undefined,
		domain: ComponentInstance<State>['domain']
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
		this.state = createComponentState<State>(domain, () => this);
		this.props = createComponentProps(rawProps);
		this.taskOwner = createTaskOwnerRecord(this.id);
		this.activation = createComponentActivation(
			this,
			() => this.mountedValue,
			() => this.disposedValue,
			() => this.activityBlockers?.size ?? 0
		);
		this.initialize();
	}

	get contexts(): Map<symbol, unknown> {
		return (this.contextsValue ??= new Map());
	}

	get contextTokens(): Map<symbol, ContextToken<unknown>> {
		return (this.contextTokensValue ??= new Map());
	}

	get mounted(): boolean {
		return this.mountedValue;
	}

	get renderFunction(): RenderFunction {
		return this.renderFunctionValue;
	}

	get refs(): RefRegistry {
		return (this.refsRegistry ??= createComponentRefRegistry(this));
	}

	get intl(): IntlFacade {
		return (this.intlFacade ??= createComponentIntlFacade(this));
	}

	get mountHandlers(): LifecycleHandler[] {
		return mutableComponentLifecycleHandlers(this, 'mount');
	}

	get activateHandlers(): LifecycleHandler[] {
		return mutableComponentLifecycleHandlers(this, 'activate');
	}

	get deactivateHandlers(): LifecycleHandler[] {
		return mutableComponentLifecycleHandlers(this, 'deactivate');
	}

	get unmountHandlers(): LifecycleHandler[] {
		return mutableComponentLifecycleHandlers(this, 'unmount');
	}

	get renderHandlers(): RenderEventHandler[] {
		return mutableComponentRenderHandlers(this);
	}

	beginRender(): void {
		this.lists?.beginRender();
	}

	endRender(): void {
		this.lists?.endRender();
	}

	hasContext(token: ContextToken<unknown>): boolean {
		this.contextTokens.set(token.id, token);
		publishContextAccess(this, token, 'read');
		return hasComponentContext(this, this.ambientContexts, token);
	}

	getContext<T>(token: ContextToken<T>): Reactive<T> {
		this.contextTokens.set(token.id, token);
		publishContextAccess(this, token, 'read');
		return getComponentContext(this, this.ambientContexts, token);
	}

	setContext<T>(token: ContextToken<T>, value: T): void {
		this.contextTokens.set(token.id, token);
		setComponentContext(this, token, value);
		publishContextAccess(this, token, 'write');
	}

	reactive<T>(
		input: TemplateStringsArray | (() => T) | T,
		...values: unknown[]
	): ReactiveValue<string> | ReactiveValue<T> {
		if (typeof input === 'function') return computed(input as () => T);
		if (!isTemplateStringsArray(input)) return computed(() => input);
		return computed(() => {
			let result = '';
			for (let index = 0; index < input.length; index++) {
				result += input[index];
				if (index < values.length) result += String(unwrap(values[index]) ?? '');
			}
			return result;
		});
	}

	ref<T>(key: RefKey<T>): RefBinding<T> {
		const refs = (this.refsValue ??= new Map());
		const existing = refs.get(key.id) as RefBinding<T> | undefined;
		if (existing) return existing;
		const binding = createComponentRefBinding(this, key);
		refs.set(key.id, binding as RefBinding<unknown>);
		return binding;
	}

	readRef<T>(key: RefKey<T>): T | undefined {
		return this.refsValue?.get(key.id)?.current as T | undefined;
	}

	map<T>(
		collection: Iterable<T> | ReactiveValue<Iterable<T>>,
		key: (item: T) => string,
		render: (item: T) => VNode,
		id?: string,
		provenance?: Iterable<T>,
		keyIdentity?: string
	): VNode {
		return (this.lists ??= createComponentListController()).map(
			collection,
			key,
			render,
			id,
			provenance,
			keyIdentity
		);
	}

	onMount(handler: LifecycleHandler): void {
		mutableComponentLifecycleHandlers(this, 'mount').push(handler);
	}

	onActivate(handler: LifecycleHandler): void {
		mutableComponentLifecycleHandlers(this, 'activate').push(handler);
	}

	onDeactivate(handler: LifecycleHandler): void {
		mutableComponentLifecycleHandlers(this, 'deactivate').push(handler);
	}

	onUnmount(handler: LifecycleHandler): void {
		mutableComponentLifecycleHandlers(this, 'unmount').push(handler);
	}

	onRender(handler: RenderEventHandler): void {
		mutableComponentRenderHandlers(this).push(handler);
	}

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
		this.activation.update();
	}

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
		this.activation.update(reason);
	}

	updateProps(nextProps: Record<string, unknown>): void {
		updateReactive(this.props, nextProps);
		this.inspection?.publish({ kind: 'props.change', component: this, path: 'props' });
	}

	unmount(reason = 'unmount'): void {
		if (this.disposedValue) return;
		this.inspection?.publish({ kind: 'component.unmount', component: this, reason });
		if (this.activation.active) this.activation.deactivate(reason);
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
		if (this.lists) teardown(() => this.lists!.dispose());
		if (this.mountController) teardown(() => this.mountController!.abort(reason));
		teardown(() => void this.taskOwner[Symbol.asyncDispose]());
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
		releaseTaskObserver(this);
		if (failed) throw firstError;
	}

	private initialize(): void {
		const resumption = resolveComponentResumption(this.domain, this.type);
		if (resumption) {
			applyComponentResumption(this.state as Reactive<Record<string, unknown>>, resumption);
			deferTaskOwnerActivations(this.taskOwner);
		}
		registerTaskOwnerHost(this, this.taskOwner);
		const readiness = componentReadinessContext(this);
		if (readiness)
			this.taskOwner.registerReadiness = (taskGeneration, settlement, commit, discard) =>
				readiness.register({ owner: this, taskGeneration, settlement, commit, discard });
		const taskObserver = taskObserverFor(this);
		if (taskObserver)
			this.taskOwner.observeSettlement = (settlement) => taskObserver.register(settlement, this);
		this.inspection?.publish({ kind: 'component.construct', component: this });
		if (!this.parent && isHydrationComponentDomain(this.domain))
			this.inspection?.publish({ kind: 'hydration.activate', component: this });
		if (!this.parent) this.contexts.set(ErrorContext.id, reactiveValue(createErrorContext()));
		applyInternalPlugins(this);
		if (resumption) prepareComponentContextResumption(this, resumption);

		let result: RenderFunction;
		try {
			result = withEffectScope(this.scope, () =>
				withComponentDomain(this.domain, () =>
					withTaskOwnerRecord(this.taskOwner, () => this.type.call(this, this.props as Props))
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
			releaseTaskOwnerActivations(this.taskOwner, (task) => {
				const continuationId = componentContinuationTaskId(task);
				return continuationId !== undefined && settledContinuations.has(continuationId);
			});
		}
		if (typeof result !== 'function') {
			const error = new TypeError(
				'eXact runtime components must synchronously return their compiled render function'
			);
			cleanupFailedComponentConstruction(this, error);
			throw error;
		}
		this.renderFunctionValue = result;
		taskObserver?.retain?.(this);
		if (taskObserver?.retain) retainTaskObserver(this, taskObserver);
	}
}

/** Creates a component instance, binds its component API, and runs the component constructor. */
export function createComponentInstance<
	State extends object,
	Props extends Record<string, unknown>
>(
	type: ComponentFunction<State, Props>,
	rawProps: Props,
	parent?: ComponentInstance<any>,
	ambientContexts: ComponentContextValues | undefined = parent?.ambientContexts,
	domain = parent?.domain ?? pageComponentDomain
): ComponentInstance<State> {
	return new ComponentInstanceImpl(type, rawProps, parent, ambientContexts, domain);
}
