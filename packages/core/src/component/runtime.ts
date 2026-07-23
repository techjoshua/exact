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
	ComponentTask,
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

import { applyInternalPlugins, defaultContexts } from './plugins.js';

import { createComponentReactiveValue, createTask } from '../task/execution.js';
import { releaseTaskObserver, retainTaskObserver, taskObserverFor } from '../task/observers.js';
import { isPromiseLike } from './async-value.js';
import { observeLifecyclePromise } from './async.js';
import { ErrorContext } from './contexts.js';
import { pageComponentDomain, withComponentDomain } from './domain.js';
import { createErrorContext, createErrorReport, handleComponentError } from './errors.js';
import { reactiveValue } from './reactive-value.js';

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
	const props = reactive(rawProps, {
		readonly: true,
		passthroughKeys: ['children'],
		onReadonlyWrite(key) {
			throw new TypeError(`Cannot write to readonly props.${String(key)}`);
		}
	}) as Reactive<Record<string, unknown>>;

	let mounted = false;
	let disposed = false;
	let acceptingTaskRegistrations = true;
	let renderFunction: RenderFunction = () => null;
	const id = `c${nextComponentId++}`;

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
		ambientContexts,
		tasks: [],
		mountHandlers: [],
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
		getContext<T>(token: ContextToken<T>): Reactive<T> {
			// Context lookup walks parents first, then falls back to framework defaults.
			// Values are stored reactive so consumers can keep using normal state reads.
			let cursor = instance.parent;
			while (cursor) {
				if (cursor.contexts.has(token.id)) {
					return cursor.contexts.get(token.id) as Reactive<T>;
				}
				cursor = cursor.parent;
			}

			if (ambientContexts?.has(token.id)) {
				const value = ambientContexts.get(token.id) as T;
				return (token.reactive ? reactiveValue(value) : value) as Reactive<T>;
			}

			if (defaultContexts.has(token.id)) {
				const value = defaultContexts.get(token.id) as T;
				return (token.reactive ? reactiveValue(value) : value) as Reactive<T>;
			}

			throw new Error(`Context "${token.description}" was not provided`);
		},
		setContext<T>(token: ContextToken<T>, value: T): void {
			instance.contexts.set(
				token.id,
				token.reactive ? reactiveValue(value) : (value as Reactive<T>)
			);
		},
		reactive<T>(
			input: TemplateStringsArray | (() => T) | T,
			...values: unknown[]
		): ComponentReactiveValue<string> | ComponentReactiveValue<T> {
			if (typeof input === 'function') {
				return createComponentReactiveValue(instance, computed(input as () => T));
			}

			if (!isTemplateStringsArray(input)) {
				return createComponentReactiveValue(
					instance,
					computed(() => input)
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
				})
			);
		},
		task: Object.assign(
			function task(...args: unknown[]): void {
				if (!acceptingTaskRegistrations) {
					throw new Error('this.task() must be registered during component setup');
				}
				const work = args[args.length - 1];
				if (typeof work !== 'function') {
					throw new TypeError('this.task() requires a work callback');
				}

				const deps = args.slice(0, -1);
				const task = createTask(instance, deps, work as (...args: any[]) => TaskResult);
				instance.tasks.push(task);
				task.run();
			},
			{
				server(...args: unknown[]): void {
					(instance.task as (...args: unknown[]) => void)(...args);
				},
				client(...args: unknown[]): void {
					(instance.task as (...args: unknown[]) => void)(...args);
				}
			}
		) as ComponentTask,
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
		onUnmount(handler: LifecycleHandler): void {
			instance.unmountHandlers.push(handler);
		},
		onRender(handler: RenderEventHandler): void {
			instance.renderHandlers.push(handler);
		},
		markMounted(): void {
			if (mounted || disposed) return;
			mounted = true;
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
		},
		updateProps(nextProps): void {
			updateReactive(props, nextProps);
		},
		unmount(reason = 'unmount'): void {
			if (disposed) return;
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

	// Framework fallback errors belong to one application root. A user-provided
	// ErrorContext installed during construction replaces this seed for its tree.
	if (!parent) instance.contexts.set(ErrorContext.id, reactiveValue(createErrorContext()));

	applyInternalPlugins(instance);

	let result: RenderFunction | RenderResult;
	try {
		result = withEffectScope(scope, () =>
			withComponentDomain(domain, () => type.call(instance, props as Props))
		);
	} catch (error) {
		acceptingTaskRegistrations = false;
		cleanupFailedConstruction(instance);
		throw error;
	}
	acceptingTaskRegistrations = false;
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

function cleanupFailedConstruction(instance: ComponentInstance<any>): void {
	instance.renderStop?.();
	instance.scope.stop();
	instance.mountController?.abort('construct-failed');
	for (const task of instance.tasks) task.stop();
}

function isTemplateStringsArray(value: unknown): value is TemplateStringsArray {
	return Array.isArray(value) && Array.isArray((value as { raw?: unknown }).raw);
}
