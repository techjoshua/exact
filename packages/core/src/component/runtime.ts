import {
	computed,
	createEffectScope,
	isReactiveValue,
	peek,
	reactive,
	ref as reactiveRef,
	registerReactiveListKey,
	unwrap,
	updateReactive,
	withEffectScope,
	type Reactive,
	type ReactiveRef,
	type ReactiveValue,
	type StopHandle
} from '@exactjs/reactive';

import { Fragment } from '../symbols.js';
import { createVNode } from '../vnode.js';

import type {
	ComponentContextValues,
	ComponentFunction,
	ComponentInstance,
	ComponentReactiveValue,
	ContextToken,
	LifecycleHandler,
	ListBinding,
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
	const listCaches = new Map<
		string,
		{ render: unknown; cache: Map<string, { item: unknown; vnode: VNode }> }
	>();
	const listKeyRegistrations = new Map<
		string,
		{ collection: object; identity: string; stop: StopHandle }
	>();
	const activeListSlots = new Set<string>();
	let mapCallIndex = 0;
	// Assignment follows scope creation because the scope error callback closes over the final instance.
	// eslint-disable-next-line prefer-const
	let instance!: ComponentInstance<State>;
	const scope = createEffectScope(undefined, (error) => {
		handleComponentError(instance, createErrorReport(error, 'reactive', instance, 'watch'));
	});
	const state = reactive({} as State);
	if (resumption) applyComponentResumption(state as Reactive<Record<string, unknown>>, resumption);
	const props = reactive(rawProps, {
		readonly: true,
		passthroughKeys: ['children'],
		onReadonlyWrite(key) {
			throw new TypeError(`Cannot write to readonly props.${String(key)}`);
		}
	}) as Reactive<Record<string, unknown>>;

	let mounted = false;
	let disposed = false;
	const activityBlockers = new Set<symbol>();
	let acceptingTaskRegistrations = true;
	let acceptingActionRegistrations = true;
	let renderFunction: RenderFunction = () => null;
	const id = `c${nextComponentId++}`;
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
			mapCallIndex = 0;
			activeListSlots.clear();
		},
		endRender(): void {
			for (const [slot, registration] of listKeyRegistrations) {
				if (activeListSlots.has(slot)) continue;
				registration.stop();
				listKeyRegistrations.delete(slot);
				listCaches.delete(slot);
			}
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
			return hasComponentContext(instance, ambientContexts, token);
		},
		getContext<T>(token: ContextToken<T>): Reactive<T> {
			return getComponentContext(instance, ambientContexts, token);
		},
		setContext<T>(token: ContextToken<T>, value: T): void {
			setComponentContext(instance, token, value);
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
			const source = peek(() => reactiveRef(collection)) as ReactiveRef<Iterable<T>> | undefined;
			const current =
				isReactiveValue(collection) && source
					? peek(() => source.get())
					: (collection as Iterable<T>);
			// A render pass gives every map call a stable slot. Reuse only when the
			// renderer itself is stable; inline render callbacks are recreated on a
			// parent render and may capture a different parent value.
			const cacheId = id ?? `map:${mapCallIndex++}`;
			activeListSlots.add(cacheId);
			const registrationCollection = unwrap(provenance ?? current) as object;
			const registrationIdentity = keyIdentity ?? Function.prototype.toString.call(key);
			const registered = listKeyRegistrations.get(cacheId);
			if (
				!registered ||
				registered.collection !== registrationCollection ||
				registered.identity !== registrationIdentity
			) {
				registered?.stop();
				const stop = registerReactiveListKey(
					provenance ?? current,
					key as (item: unknown) => string,
					id ?? 'an unlabelled this.map() call',
					keyIdentity
				);
				listKeyRegistrations.set(cacheId, {
					collection: registrationCollection,
					identity: registrationIdentity,
					stop
				});
			}
			const previous = listCaches.get(cacheId);
			const cache =
				previous?.render === render
					? previous.cache
					: new Map<string, { item: unknown; vnode: VNode }>();
			if (!previous || previous.render !== render) listCaches.set(cacheId, { render, cache });
			return createVNode(Fragment, {
				key: id,
				list: {
					collection: current,
					source,
					key,
					render,
					cache: cache as Map<string, { item: T; vnode: VNode }>
				} satisfies ListBinding<T>
			});
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
			for (const registration of listKeyRegistrations.values()) teardown(registration.stop);
			listKeyRegistrations.clear();
			if (instance.mountController) teardown(() => instance.mountController!.abort(reason));
			teardown(() => actionApi.dispose(reason));
			teardown(() => cancelComponentInteractions(instance, reason));
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
	};
	domain.inspection?.publish({ kind: 'component.construct', component: instance });

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
			withComponentDomain(domain, () => type.call(instance, props as Props))
		);
	} catch (error) {
		acceptingTaskRegistrations = false;
		acceptingActionRegistrations = false;
		cleanupFailedComponentConstruction(instance, error);
		throw error;
	}
	if (resumption) {
		applyComponentResumption(state as Reactive<Record<string, unknown>>, resumption);
		startResumedComponentTasks(instance, resumption);
	}
	acceptingTaskRegistrations = false;
	acceptingActionRegistrations = false;
	renderFunction = typeof result === 'function' ? (result as RenderFunction) : () => result;

	const taskObserver = taskObserverFor(instance);
	taskObserver?.retain?.(instance);
	if (taskObserver?.retain) retainTaskObserver(instance, taskObserver);

	return instance;
}

/** Transfers a live component to a new logical parent during renderer-owned root replacement. */
export function reparentComponentInstance(
	instance: ComponentInstance<any>,
	parent?: ComponentInstance<any>
): void {
	for (let cursor = parent; cursor; cursor = cursor.parent) {
		if (cursor === instance) throw new Error('Cannot create a component parent cycle');
	}
	instance.parent = parent;
}
