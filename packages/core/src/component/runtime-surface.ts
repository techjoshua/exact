import type { Reactive } from '@exactjs/reactive/framework/runtime';
import type { ComponentLog } from '../logging.js';
import type { IntlFacade } from '../localization/contracts.js';
import type {
	Component,
	ComponentContextValues,
	ContextToken,
	LifecycleHandler,
	RefRegistry,
	RenderEventHandler
} from './contracts.js';

/**
 * Minimal durable component surface shared by every compiled component.
 *
 * Optional authored operations are declaration-only here. Compiler-selected runtime entries
 * install their implementations on the shared prototype, keeping unused implementation graphs
 * unreachable without changing the public {@link Component} authoring contract.
 */
export abstract class ComponentRuntimeSurface<State extends object> {
	abstract readonly state: Reactive<State>;
	abstract readonly ambientContexts?: ComponentContextValues;
	private contextsValue?: Map<symbol, unknown>;
	private contextTokensValue?: Map<symbol, ContextToken<unknown>>;

	/** Returns the lazily allocated local context value map owned by this instance. */
	get contexts(): Map<symbol, unknown> {
		return (this.contextsValue ??= new Map());
	}

	/** Returns the lazily allocated token catalog used for inspection and resumption. */
	get contextTokens(): Map<symbol, ContextToken<unknown>> {
		return (this.contextTokensValue ??= new Map());
	}

	declare readonly log: ComponentLog;
	declare readonly intl: IntlFacade;
	declare readonly refs: RefRegistry;
	declare readonly mountHandlers: LifecycleHandler[];
	declare readonly activateHandlers: LifecycleHandler[];
	declare readonly deactivateHandlers: LifecycleHandler[];
	declare readonly unmountHandlers: LifecycleHandler[];
	declare readonly renderHandlers: RenderEventHandler[];
	declare ref: Component<State>['ref'];
	declare map: Component<State>['map'];
	declare reactive: Component<State>['reactive'];
	declare hasContext: Component<State>['hasContext'];
	declare getContext: Component<State>['getContext'];
	declare setContext: Component<State>['setContext'];
	declare onMount: Component<State>['onMount'];
	declare onActivate: Component<State>['onActivate'];
	declare onDeactivate: Component<State>['onDeactivate'];
	declare onUnmount: Component<State>['onUnmount'];
	declare onRender: Component<State>['onRender'];
	declare own: Component<State>['own'];
}
