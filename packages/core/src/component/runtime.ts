import {
	computed,
	createEffectScope,
	reactive,
	unwrap,
	updateReactive,
	withEffectScope,
	type Reactive,
	type ReactiveValue
} from '@exactjs/reactive';

import type {
	ComponentContextValues,
	ComponentFunction,
	ComponentInstance,
	ContextToken,
	LifecycleHandler,
	RefBinding,
	RefKey,
	RenderEventHandler,
	RenderFunction,
	VNode
} from './contracts.js';

import { createNoopComponentLog } from './log.js';

import { applyInternalPlugins } from './plugins.js';
import { createComponentActivation, type ComponentActivation } from './activation.js';

import { releaseTaskObserver, retainTaskObserver, taskObserverFor } from '../tasks/observers.js';
import { isPromiseLike } from './async-value.js';
import { observeLifecyclePromise } from './async.js';
import { ErrorContext } from './contexts.js';
import { getComponentContext, hasComponentContext, setComponentContext } from './context-api.js';
import { prepareComponentContextResumption } from './context-resumption.js';
import { cleanupFailedComponentConstruction, isTemplateStringsArray } from './construction.js';
import {
	componentDomainInspection,
	isHydrationComponentDomain,
	pageComponentDomain,
	resolveComponentResumption,
	withComponentDomain
} from './domain.js';
import { createErrorContext, createErrorReport, handleComponentError } from './errors.js';
import { reactiveValue } from './reactive-value.js';
import { componentReadinessContext } from './readiness.js';
import { applyComponentResumption } from './resumption.js';
import { createTaskOwnerRecord, withTaskOwnerRecord } from '../tasks/frame-runtime.js';
import { registerTaskOwnerHost } from '../tasks/owner-hosts.js';
import { deferTaskOwnerActivations, releaseTaskOwnerActivations } from '../tasks/activation.js';
import { componentContinuationTaskId } from '../tasks/component-continuation.js';
import { createComponentProps, createComponentState } from './state.js';
import { publishContextAccess } from './context-inspection.js';
import { createComponentListController } from './list-controller.js';
export { reparentComponentInstance } from './ownership.js';

let nextComponentId = 1;

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
	const resumption = resolveComponentResumption(domain, type);
	const inspection = componentDomainInspection(domain);
	const refs = new Map<symbol, RefBinding<unknown>>();
	const lists = createComponentListController();
	// Assignment follows scope creation because the scope error callback closes over the final instance.
	// eslint-disable-next-line prefer-const
	let instance!: ComponentInstance<State>;
	const scope = createEffectScope(undefined, (error) => {
		handleComponentError(instance, createErrorReport(error, 'reactive', instance, 'watch'));
	});
	const state = createComponentState<State>(domain, () => instance);
	if (resumption) applyComponentResumption(state as Reactive<Record<string, unknown>>, resumption);
	const props = createComponentProps(rawProps);

	let mounted = false;
	let disposed = false;
	const activityBlockers = new Set<symbol>();
	let renderFunction: RenderFunction = () => null;
	const id = `c${nextComponentId++}`;
	const taskOwner = createTaskOwnerRecord(id);
	if (resumption) deferTaskOwnerActivations(taskOwner);
	instance = {
		type,
		parent,
		domain,
		id,
		scope,
		state,
		log: createNoopComponentLog(),
		props,
		contexts: new Map(),
		contextTokens: new Map(),
		ambientContexts,
		mountHandlers: [],
		activateHandlers: [],
		deactivateHandlers: [],
		unmountHandlers: [],
		renderHandlers: [],
		get mounted() {
			return mounted;
		},
		beginRender(): void {
			lists.beginRender();
		},
		endRender(): void {
			lists.endRender();
		},
		get renderFunction() {
			return renderFunction;
		},
		refs: {
			get<T>(key: RefKey<T>) {
				return refs.get(key.id)?.current as T | undefined;
			}
		},
		hasContext(token: ContextToken<unknown>): boolean {
			instance.contextTokens.set(token.id, token);
			publishContextAccess(instance, token, 'read');
			return hasComponentContext(instance, ambientContexts, token);
		},
		getContext<T>(token: ContextToken<T>): Reactive<T> {
			instance.contextTokens.set(token.id, token);
			publishContextAccess(instance, token, 'read');
			return getComponentContext(instance, ambientContexts, token);
		},
		setContext<T>(token: ContextToken<T>, value: T): void {
			instance.contextTokens.set(token.id, token);
			setComponentContext(instance, token, value);
			publishContextAccess(instance, token, 'write');
		},
		reactive<T>(
			input: TemplateStringsArray | (() => T) | T,
			...values: unknown[]
		): ReactiveValue<string> | ReactiveValue<T> {
			if (typeof input === 'function') {
				return computed(input as () => T);
			}

			if (!isTemplateStringsArray(input)) {
				return computed(() => input);
			}

			return computed(() => {
				let result = '';
				for (let index = 0; index < input.length; index++) {
					result += input[index];
					if (index < values.length) result += String(unwrap(values[index]) ?? '');
				}
				return result;
			});
		},
		ref<T>(key: RefKey<T>): RefBinding<T> {
			const existing = refs.get(key.id) as RefBinding<T> | undefined;
			if (existing) return existing;
			const slot = reactive(
				{ current: undefined as T | undefined },
				{ passthroughKeys: ['current'] }
			);
			const binding: RefBinding<T> = {
				get current() {
					return slot.current;
				},
				key,
				owner: instance,
				fulfill(value) {
					slot.current = value;
				}
			};
			refs.set(key.id, binding as RefBinding<unknown>);
			return binding;
		},
		map<T>(
			collection: Iterable<T> | ReactiveValue<Iterable<T>>,
			key: (item: T) => string,
			render: (item: T) => VNode,
			id?: string,
			provenance?: Iterable<T>,
			keyIdentity?: string
		): VNode {
			return lists.map(collection, key, render, id, provenance, keyIdentity);
		},
		onMount(handler: LifecycleHandler): void {
			instance.mountHandlers.push(handler);
		},
		onActivate(handler: LifecycleHandler): void {
			instance.activateHandlers.push(handler);
		},
		onDeactivate(handler: LifecycleHandler): void {
			instance.deactivateHandlers.push(handler);
		},
		onUnmount(handler: LifecycleHandler): void {
			instance.unmountHandlers.push(handler);
		},
		onRender(handler: RenderEventHandler): void {
			instance.renderHandlers.push(handler);
		},
		markMounted(): void {
			if (mounted || disposed) return;
			mounted = true;
			inspection?.publish({ kind: 'component.mount', component: instance });
			instance.mountController = new AbortController();
			for (const handler of instance.mountHandlers) {
				if (disposed || !mounted) break;
				try {
					const result = handler({ signal: instance.mountController.signal });
					if (isPromiseLike(result))
						observeLifecyclePromise(instance, Promise.resolve(result), 'mount');
				} catch (error) {
					handleComponentError(instance, createErrorReport(error, 'lifecycle', instance, 'mount'));
				}
			}
			activation.update();
		},
		setActivity(token: symbol, active: boolean, reason = 'activity'): void {
			if (active) activityBlockers.delete(token);
			else activityBlockers.add(token);
			inspection?.publish({
				kind: 'activity.change',
				component: instance,
				reason,
				attributes: Object.freeze({
					active: activityBlockers.size === 0,
					blockers: activityBlockers.size
				})
			});
			activation.update(reason);
		},
		updateProps(nextProps): void {
			updateReactive(props, nextProps);
			inspection?.publish({
				kind: 'props.change',
				component: instance,
				path: 'props'
			});
		},
		unmount(reason = 'unmount'): void {
			if (disposed) return;
			inspection?.publish({
				kind: 'component.unmount',
				component: instance,
				reason
			});
			if (activation.active) activation.deactivate(reason);
			disposed = true;
			mounted = false;
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
			if (instance.renderStop) teardown(instance.renderStop);
			teardown(() => instance.scope.stop());
			teardown(() => lists.dispose());
			if (instance.mountController) teardown(() => instance.mountController!.abort(reason));
			teardown(() => {
				void taskOwner[Symbol.asyncDispose]();
			});
			for (const handler of instance.unmountHandlers) {
				try {
					const result = handler({ signal: AbortSignal.abort(reason), reason });
					if (isPromiseLike(result))
						observeLifecyclePromise(instance, Promise.resolve(result), 'unmount');
				} catch (error) {
					teardown(() => {
						handleComponentError(
							instance,
							createErrorReport(error, 'lifecycle', instance, 'unmount')
						);
					});
				}
			}
			releaseTaskObserver(instance);
			if (failed) throw firstError;
		}
	} as ComponentInstance<State>;
	registerTaskOwnerHost(instance, taskOwner);
	const readiness = componentReadinessContext(instance);
	if (readiness) {
		taskOwner.registerReadiness = (taskGeneration, settlement, commit, discard) =>
			readiness.register({ owner: instance, taskGeneration, settlement, commit, discard });
	}
	const taskObserver = taskObserverFor(instance);
	if (taskObserver) {
		taskOwner.observeSettlement = (settlement) => taskObserver.register(settlement, instance);
	}
	inspection?.publish({ kind: 'component.construct', component: instance });
	if (!parent && isHydrationComponentDomain(domain))
		inspection?.publish({
			kind: 'hydration.activate',
			component: instance
		});

	// Framework fallback errors belong to one application root. A user-provided
	// ErrorContext installed during construction replaces this seed for its tree.
	const activation: ComponentActivation = createComponentActivation(
		instance,
		() => mounted,
		() => disposed,
		activityBlockers
	);
	if (!parent) instance.contexts.set(ErrorContext.id, reactiveValue(createErrorContext()));

	applyInternalPlugins(instance);
	if (resumption) prepareComponentContextResumption(instance, resumption);

	let result: RenderFunction;
	try {
		result = withEffectScope(scope, () =>
			withComponentDomain(domain, () =>
				withTaskOwnerRecord(taskOwner, () => type.call(instance, props as Props))
			)
		);
	} catch (error) {
		cleanupFailedComponentConstruction(instance, error);
		throw error;
	}
	if (resumption) {
		applyComponentResumption(state as Reactive<Record<string, unknown>>, resumption);
		inspection?.publish({
			kind: 'resumption.activate',
			component: instance
		});
		const settledContinuations = new Set(resumption.settledContinuations);
		releaseTaskOwnerActivations(taskOwner, (task) => {
			const continuationId = componentContinuationTaskId(task);
			return continuationId !== undefined && settledContinuations.has(continuationId);
		});
	}
	if (typeof result !== 'function') {
		const error = new TypeError(
			'eXact runtime components must synchronously return their compiled render function'
		);
		cleanupFailedComponentConstruction(instance, error);
		throw error;
	}
	renderFunction = result;

	taskObserver?.retain?.(instance);
	if (taskObserver?.retain) retainTaskObserver(instance, taskObserver);

	return instance;
}
