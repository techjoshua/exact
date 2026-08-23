import type { Reactive, ReactiveValue } from '@exactjs/reactive/framework/runtime';
import type { ComponentLog } from '../logging.js';
import type { IntlFacade } from '../localization/contracts.js';
import { componentContextCapability } from './context-capability.js';
import type {
	AnyComponentInstance,
	ComponentContextValues,
	ContextToken,
	LifecycleHandler,
	RefBinding,
	RefKey,
	RefRegistry,
	RenderEventHandler,
	VNode
} from './contracts.js';
import {
	mutableComponentLifecycleHandlers,
	mutableComponentRenderHandlers
} from './lifecycle-handlers.js';
import { componentListCapability } from './list-capability.js';
import { componentLocalizationCapability } from './localization-capability.js';
import { createComponentLog } from './log.js';
import { createComponentReactive } from './reactive-expression.js';
import { componentRefCapability } from './ref-capability.js';
import { disposeComponentResource } from './resource-ownership.js';

/** Shared uncommon component surface with allocation-on-use capability values. */
export abstract class ComponentRuntimeSurface<State extends object> {
	abstract readonly state: Reactive<State>;
	abstract readonly ambientContexts?: ComponentContextValues;
	private contextsValue?: Map<symbol, unknown>;
	private contextTokensValue?: Map<symbol, ContextToken<unknown>>;
	private logValue?: ComponentLog;
	private intlFacade?: IntlFacade;

	private get instance(): AnyComponentInstance {
		return this as unknown as AnyComponentInstance;
	}

	/** Returns the lazily allocated local context value map owned by this instance. */
	get contexts(): Map<symbol, unknown> {
		return (this.contextsValue ??= new Map());
	}

	/** Returns the lazily allocated component logger shared by every call from this instance. */
	get log(): ComponentLog {
		return (this.logValue ??= createComponentLog(this.instance));
	}

	/** Returns the lazily allocated token catalog used for inspection and resumption. */
	get contextTokens(): Map<symbol, ContextToken<unknown>> {
		return (this.contextTokensValue ??= new Map());
	}

	/** Returns the compiler-selected ref registry, allocating its capability state lazily. */
	get refs(): RefRegistry {
		return componentRefCapability().registry(this.instance);
	}

	/** Returns the lazy localization facade or fails when the artifact omitted that capability. */
	get intl(): IntlFacade {
		const capability = componentLocalizationCapability();
		if (!capability)
			throw new Error(
				'Component localization is unavailable because this artifact did not include the localization capability'
			);
		return (this.intlFacade ??= capability.create(this.instance));
	}

	/** Returns the mutable mount-handler lane retained by the lifecycle capability. */
	get mountHandlers(): LifecycleHandler[] {
		return mutableComponentLifecycleHandlers(this.instance, 'mount');
	}

	/** Returns the mutable activation-handler lane retained by the lifecycle capability. */
	get activateHandlers(): LifecycleHandler[] {
		return mutableComponentLifecycleHandlers(this.instance, 'activate');
	}

	/** Returns the mutable deactivation-handler lane retained by the lifecycle capability. */
	get deactivateHandlers(): LifecycleHandler[] {
		return mutableComponentLifecycleHandlers(this.instance, 'deactivate');
	}

	/** Returns the mutable unmount-handler lane retained by the lifecycle capability. */
	get unmountHandlers(): LifecycleHandler[] {
		return mutableComponentLifecycleHandlers(this.instance, 'unmount');
	}

	/** Returns the mutable post-render handler lane retained by the lifecycle capability. */
	get renderHandlers(): RenderEventHandler[] {
		return mutableComponentRenderHandlers(this.instance);
	}

	/** Transfers a disposable resource to this component's unmount lifetime. */
	own<T extends Disposable | AsyncDisposable | { dispose(): unknown }>(resource: T): T {
		this.onUnmount(() => disposeComponentResource(resource));
		return resource;
	}

	/** Reports whether a token is available while publishing its read for inspection. */
	hasContext(token: ContextToken<unknown>): boolean {
		this.contextTokens.set(token.id, token);
		const capability = componentContextCapability();
		capability.publish(this.instance, token, 'read');
		return capability.has(this.instance, this.ambientContexts, token);
	}

	/** Reads one reactive context value and records the compiler-observable dependency. */
	getContext<T>(token: ContextToken<T>): Reactive<T> {
		this.contextTokens.set(token.id, token);
		const capability = componentContextCapability();
		capability.publish(this.instance, token, 'read');
		return capability.get(this.instance, this.ambientContexts, token);
	}

	/** Publishes one descendant context value owned by this durable instance. */
	setContext<T>(token: ContextToken<T>, value: T): void {
		this.contextTokens.set(token.id, token);
		const capability = componentContextCapability();
		capability.set(this.instance, token, value);
		capability.publish(this.instance, token, 'write');
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
		return componentRefCapability().ref(this.instance, key);
	}

	/** Reads the current value of a typed ref without changing its ownership. */
	readRef<T>(key: RefKey<T>): T | undefined {
		return componentRefCapability().read(this.instance, key);
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
			this.instance,
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
		mutableComponentLifecycleHandlers(this.instance, 'mount').push(handler);
	}

	/** Registers work for each transition into the active component state. */
	onActivate(handler: LifecycleHandler): void {
		mutableComponentLifecycleHandlers(this.instance, 'activate').push(handler);
	}

	/** Registers work for each transition out of the active component state. */
	onDeactivate(handler: LifecycleHandler): void {
		mutableComponentLifecycleHandlers(this.instance, 'deactivate').push(handler);
	}

	/** Registers final cleanup that runs when the durable instance is disposed. */
	onUnmount(handler: LifecycleHandler): void {
		mutableComponentLifecycleHandlers(this.instance, 'unmount').push(handler);
	}

	/** Registers work that runs after a committed render publication. */
	onRender(handler: RenderEventHandler): void {
		mutableComponentRenderHandlers(this.instance).push(handler);
	}
}
