import {
	computed,
	createEffectScope,
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
	ComponentReactiveValue,
	ContextToken,
	LifecycleHandler,
	RefBinding,
	RefKey,
	RenderEventHandler,
	RenderFunction,
	RenderResult,
	TaskResult,
	VNode
} from './contracts.js';

import { createNoopComponentLog } from './log.js';

import { applyInternalPlugins } from './plugins.js';
import { createComponentActivation, type ComponentActivation } from './activation.js';

import { createComponentReactiveValue, createTask } from '../task/execution.js';
import { createComponentTaskApi } from './task-api.js';
import { releaseTaskObserver, retainTaskObserver, taskObserverFor } from '../task/observers.js';
import { isPromiseLike } from './async-value.js';
import { observeLifecyclePromise } from './async.js';
import { ErrorContext } from './contexts.js';
import { getComponentContext, hasComponentContext, setComponentContext } from './context-api.js';
import { prepareComponentContextResumption } from './context-resumption.js';
import { cleanupFailedComponentConstruction, isTemplateStringsArray } from './construction.js';
import { pageComponentDomain, withComponentDomain } from './domain.js';
import { createErrorContext, createErrorReport, handleComponentError } from './errors.js';
import { reactiveValue } from './reactive-value.js';
import {
	applyComponentResumption,
	startRegisteredTask,
	startResumedComponentTasks
} from './resumption.js';
import { createComponentActionApi } from './action-api.js';
import { cancelComponentInteractions } from '../interaction/execution.js';
import { readExactInspectionSource } from './inspection-source.js';
import { createTaskOwnerRecord, withTaskOwnerRecord } from '../tasks/frame-runtime.js';
import { registerTaskOwnerHost } from '../tasks/owner-hosts.js';
import { deferTaskOwnerActivations, releaseTaskOwnerActivations } from '../tasks/activation.js';
import { componentContinuationTaskId } from '../task/continuation.js';
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
	const resumption = domain.resumeComponent?.(type);
	const refs = new Map<symbol, unknown>();
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
	let acceptingTaskRegistrations = true;
	let acceptingActionRegistrations = true;
	let renderFunction: RenderFunction = () => null;
	const id = `c${nextComponentId++}`;
	const taskOwner = createTaskOwnerRecord(id);
	if (resumption) deferTaskOwnerActivations(taskOwner);
	const actionApi = createComponentActionApi(
		() => instance,
		() => acceptingActionRegistrations
	);

	instance = {
		type,
		parent,
		domain,
		id,
		scope,
		state,
		log: createNoopComponentLog(),
		action: actionApi.action,
		props,
		contexts: new Map(),
		contextTokens: new Map(),
		ambientContexts,
		tasks: [],
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
				return refs.get(key.id) as T | undefined;
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
		): ComponentReactiveValue<string> | ComponentReactiveValue<T> {
			if (typeof input === 'function') {
				return createComponentReactiveValue(instance, computed(input as () => T), (task) =>
					startRegisteredTask(task, resumption)
				);
			}

			if (!isTemplateStringsArray(input)) {
				return createComponentReactiveValue(
					instance,
					computed(() => input),
					(task) => startRegisteredTask(task, resumption)
				);
			}

			return createComponentReactiveValue(
				instance,
				computed(() => {
					let result = '';
					for (let index = 0; index < input.length; index++) {
						result += input[index];
						if (index < values.length) result += String(unwrap(values[index]) ?? '');
					}
					return result;
				}),
				(task) => startRegisteredTask(task, resumption)
			);
		},
		task: createComponentTaskApi((policy, args) => {
			if (!acceptingTaskRegistrations) {
				throw new Error('this.task() must be registered during component setup');
			}
			const work = args[args.length - 1];
			if (typeof work !== 'function') {
				throw new TypeError('this.task() requires a work callback');
			}

			const deps = args.slice(0, -1);
			const task = createTask(instance, deps, work as (...args: any[]) => TaskResult, policy);
			task.sourceEntityId = readExactInspectionSource(work);
			instance.tasks.push(task);
			startRegisteredTask(task, resumption);
		}),
		ref<T>(key: RefKey<T>): RefBinding<T> {
			return {
				key,
				owner: instance,
				fulfill(value) {
					if (value === undefined) {
						refs.delete(key.id);
					} else {
						refs.set(key.id, value);
					}
				}
			};
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
			domain.inspection?.publish({ kind: 'component.mount', component: instance });
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
			domain.inspection?.publish({
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
			domain.inspection?.publish({ kind: 'props.change', component: instance, path: 'props' });
		},
		unmount(reason = 'unmount'): void {
			if (disposed) return;
			domain.inspection?.publish({
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
			teardown(() => actionApi.dispose(reason));
			teardown(() => cancelComponentInteractions(instance, reason));
			teardown(() => {
				void taskOwner[Symbol.asyncDispose]();
			});
			for (const task of instance.tasks) teardown(() => task.stop());
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
	const taskObserver = taskObserverFor(instance);
	if (taskObserver) {
		taskOwner.observeSettlement = (settlement) => taskObserver.register(settlement, instance);
	}
	domain.inspection?.publish({ kind: 'component.construct', component: instance });
	if (!parent && domain.inspectionActivation === 'hydration')
		domain.inspection?.publish({ kind: 'hydration.activate', component: instance });

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

	let result: RenderFunction | RenderResult;
	try {
		result = withEffectScope(scope, () =>
			withComponentDomain(domain, () =>
				withTaskOwnerRecord(taskOwner, () => type.call(instance, props as Props))
			)
		);
	} catch (error) {
		acceptingTaskRegistrations = false;
		acceptingActionRegistrations = false;
		cleanupFailedComponentConstruction(instance, error);
		throw error;
	}
	if (resumption) {
		applyComponentResumption(state as Reactive<Record<string, unknown>>, resumption);
		domain.inspection?.publish({ kind: 'resumption.activate', component: instance });
		const settledContinuations = new Set(resumption.settledContinuations);
		releaseTaskOwnerActivations(taskOwner, (task) => {
			const continuationId = componentContinuationTaskId(task);
			return continuationId !== undefined && settledContinuations.has(continuationId);
		});
		startResumedComponentTasks(instance, resumption);
	}
	acceptingTaskRegistrations = false;
	acceptingActionRegistrations = false;
	renderFunction = typeof result === 'function' ? (result as RenderFunction) : () => result;

	taskObserver?.retain?.(instance);
	if (taskObserver?.retain) retainTaskObserver(instance, taskObserver);

	return instance;
}
