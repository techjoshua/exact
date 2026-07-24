import {
	createVNode,
	type ComponentFunction,
	type ComponentInstance,
	type ContextToken,
	type VNode
} from '@exactjs/core';
import { snapshot, unwrap } from '@exactjs/reactive';
import {
	createExactContextRuntime,
	type ExactContextRegistration,
	type ExactRequestLike
} from '@exactjs/server';
import {
	renderToHydratableStringAsync,
	renderToStringAsync,
	type HydrationScriptOptions,
	type RenderToStringOptions
} from '@exactjs/ssr';

import type { PropsOf, StateOf } from '../contracts.js';

type CapturedComponent = {
	id: string;
	type: ComponentFunction<any, any>;
	state: unknown;
	props: unknown;
	parentId?: string;
	provided: Map<symbol, unknown>;
	ambient: Map<symbol, unknown>;
};

/** Represents one settled component from a server render. */
export class ServerTestComponent<State extends object = any, Props = any> {
	constructor(
		readonly view: ServerTestView,
		private readonly captured: CapturedComponent
	) {}

	get id(): string {
		return this.captured.id;
	}
	get name(): string {
		return this.captured.type.name || 'Anonymous';
	}
	get type(): ComponentFunction<State, Props> {
		return this.captured.type as ComponentFunction<State, Props>;
	}
	state(): State {
		return this.captured.state as State;
	}
	props(): Props {
		return this.captured.props as Props;
	}
	/** Returns the context inherited by this component, matching Component.getContext(). */
	context<T>(token: ContextToken<T>): T {
		let cursor = this.parent();
		while (cursor) {
			if (cursor.captured.provided.has(token.id))
				return unwrap(cursor.captured.provided.get(token.id)) as T;
			cursor = cursor.parent();
		}
		if (this.captured.ambient.has(token.id))
			return unwrap(this.captured.ambient.get(token.id)) as T;
		throw new Error(`Context "${token.description}" was not provided`);
	}
	/** Returns a value this component provided for its descendants. */
	providedContext<T>(token: ContextToken<T>): T | undefined {
		return unwrap(this.captured.provided.get(token.id)) as T | undefined;
	}
	parent(): ServerTestComponent | undefined {
		return this.captured.parentId ? this.view.componentById(this.captured.parentId) : undefined;
	}
	children<C extends ComponentFunction<any, any>>(
		type?: C
	): ServerTestComponent<StateOf<C>, PropsOf<C>>[] {
		return this.view
			.allComponents()
			.filter(
				(component) => component.captured.parentId === this.id && (!type || component.type === type)
			) as ServerTestComponent<StateOf<C>, PropsOf<C>>[];
	}
	child<C extends ComponentFunction<any, any>>(
		type: C
	): ServerTestComponent<StateOf<C>, PropsOf<C>> {
		return requireOne(this.children(type), `direct child ${type.name || 'anonymous'}`);
	}
	find<C extends ComponentFunction<any, any>>(
		type: C
	): ServerTestComponent<StateOf<C>, PropsOf<C>> {
		return requireOne(this.findAll(type), `descendant ${type.name || 'anonymous'}`);
	}
	findAll<C extends ComponentFunction<any, any>>(
		type: C
	): ServerTestComponent<StateOf<C>, PropsOf<C>>[] {
		const output: ServerTestComponent<StateOf<C>, PropsOf<C>>[] = [];
		const visit = (component: ServerTestComponent) => {
			for (const child of component.children()) {
				if (child.type === type) output.push(child as ServerTestComponent<StateOf<C>, PropsOf<C>>);
				visit(child);
			}
		};
		visit(this);
		return output;
	}
}

/** Describes a settled, disposed server component render. */
export class ServerTestView<State extends object = any, Props = any> {
	readonly root: ServerTestComponent<State, Props>;
	private readonly byId = new Map<string, ServerTestComponent>();

	constructor(
		readonly html: string,
		captured: readonly CapturedComponent[],
		readonly hydrationScript?: string,
		readonly htmlWithHydration?: string,
		private readonly applicationValues = new Map<symbol, unknown>(),
		private readonly requestValues = new Map<symbol, unknown>()
	) {
		for (const item of captured) this.byId.set(item.id, new ServerTestComponent(this, item));
		const root = captured.find((item) => item.parentId === undefined);
		if (!root) throw new Error('The server render did not contain a component instance');
		this.root = this.byId.get(root.id) as ServerTestComponent<State, Props>;
	}

	component<C extends ComponentFunction<any, any>>(
		type: C
	): ServerTestComponent<StateOf<C>, PropsOf<C>> {
		if (this.root.type === type)
			return this.root as unknown as ServerTestComponent<StateOf<C>, PropsOf<C>>;
		return this.root.find(type);
	}
	components<C extends ComponentFunction<any, any>>(
		type: C
	): ServerTestComponent<StateOf<C>, PropsOf<C>>[] {
		const roots =
			this.root.type === type
				? [this.root as unknown as ServerTestComponent<StateOf<C>, PropsOf<C>>]
				: [];
		return [...roots, ...this.root.findAll(type)];
	}
	applicationContext<T>(token: ContextToken<T>): T | undefined {
		return unwrap(this.applicationValues.get(token.id)) as T | undefined;
	}
	requestContext<T>(token: ContextToken<T>): T | undefined {
		return unwrap(this.requestValues.get(token.id)) as T | undefined;
	}
	allComponents(): ServerTestComponent[] {
		return [...this.byId.values()];
	}
	componentById(id: string): ServerTestComponent | undefined {
		return this.byId.get(id);
	}
}

/** Configures a server component test render. */
export type ServerTestRenderOptions = Omit<
	RenderToStringOptions,
	'contexts' | 'onComponentRendered'
> & {
	hydration?: false | HydrationScriptOptions;
	request?: ExactRequestLike;
	platformRequest?: unknown;
};

/** Builds manifest-independent tests around a compiled server component artifact. */
export class ServerTestComponentBuilder<C extends ComponentFunction<any, any>> {
	private componentProps = {} as PropsOf<C>;
	private readonly componentContexts = new Map<symbol, unknown>();
	private readonly applicationOverrides: Array<readonly [ContextToken<any>, unknown]> = [];
	private readonly requestOverrides: Array<readonly [ContextToken<any>, unknown]> = [];
	private applicationRegistrations: readonly ExactContextRegistration<any>[] = [];
	private requestRegistrations: readonly ExactContextRegistration<any>[] = [];

	constructor(readonly component: C) {}
	props(props: PropsOf<C>): this {
		this.componentProps = props;
		return this;
	}
	context<T>(token: ContextToken<T>, value: T): this {
		if (token.scope !== 'component')
			throw new Error(
				`Context "${token.description}" has ${token.scope} scope; use .${token.scope}Context()`
			);
		this.componentContexts.set(token.id, value);
		return this;
	}
	contexts(entries: Iterable<readonly [ContextToken<any>, unknown]>): this {
		for (const [token, value] of entries) this.context(token, value);
		return this;
	}
	applicationContext<T>(token: ContextToken<T>, value: T): this {
		this.applicationOverrides.push([token, value]);
		return this;
	}
	requestContext<T>(token: ContextToken<T>, value: T): this {
		this.requestOverrides.push([token, value]);
		return this;
	}
	applicationContexts(registrations: readonly ExactContextRegistration<any>[]): this {
		this.applicationRegistrations = registrations;
		return this;
	}
	requestContexts(registrations: readonly ExactContextRegistration<any>[]): this {
		this.requestRegistrations = registrations;
		return this;
	}
	async render(
		options: ServerTestRenderOptions = {}
	): Promise<ServerTestView<StateOf<C>, PropsOf<C>>> {
		return renderServerTest(
			createVNode(this.component, this.componentProps as Record<string, unknown>),
			options,
			{
				componentContexts: this.componentContexts,
				applicationRegistrations: this.applicationRegistrations,
				requestRegistrations: this.requestRegistrations,
				applicationOverrides: this.applicationOverrides,
				requestOverrides: this.requestOverrides
			}
		) as Promise<ServerTestView<StateOf<C>, PropsOf<C>>>;
	}
}

/** Creates a server test builder for a compiled `.exact.server` component export. */
export function testServerComponent<C extends ComponentFunction<any, any>>(
	component: C
): ServerTestComponentBuilder<C> {
	return new ServerTestComponentBuilder(component);
}

type ServerContextSetup = {
	componentContexts?: ReadonlyMap<symbol, unknown>;
	applicationRegistrations?: readonly ExactContextRegistration<any>[];
	requestRegistrations?: readonly ExactContextRegistration<any>[];
	applicationOverrides?: readonly (readonly [ContextToken<any>, unknown])[];
	requestOverrides?: readonly (readonly [ContextToken<any>, unknown])[];
};

/** Renders an arbitrary server vnode while preserving inspectable component snapshots. */
export async function renderServerTest(
	vnode: VNode,
	options: ServerTestRenderOptions = {},
	setup: ServerContextSetup = {}
): Promise<ServerTestView> {
	const runtime = createExactContextRuntime({
		applicationContexts: setup.applicationRegistrations,
		requestContexts: setup.requestRegistrations,
		contextOverrides: {
			application: setup.applicationOverrides,
			request: setup.requestOverrides
		}
	});
	const request =
		options.request ?? ({ method: 'GET', url: 'http://exact.test/' } satisfies ExactRequestLike);
	const opened = await runtime.open(request, options.platformRequest);
	const applicationValues = new Map<symbol, unknown>();
	const requestValues = new Map<symbol, unknown>();
	for (const [token] of setup.applicationRegistrations ?? [])
		applicationValues.set(token.id, await opened.context.get(token));
	for (const [token] of setup.applicationOverrides ?? [])
		applicationValues.set(token.id, await opened.context.get(token));
	for (const [token] of setup.requestRegistrations ?? [])
		requestValues.set(token.id, await opened.context.get(token));
	for (const [token] of setup.requestOverrides ?? [])
		requestValues.set(token.id, await opened.context.get(token));
	const contexts = new Map(opened.context.componentValues);
	for (const [id, value] of setup.componentContexts ?? []) contexts.set(id, value);
	const captured: CapturedComponent[] = [];
	const capture = (instance: ComponentInstance<any>) => {
		captured.push({
			id: instance.id,
			type: instance.type,
			state: snapshot(instance.state),
			props: snapshot(instance.props),
			parentId: instance.parent?.id,
			provided: new Map(instance.contexts),
			ambient: new Map(instance.ambientContexts)
		});
	};
	const {
		hydration,
		request: _request,
		platformRequest: _platformRequest,
		...renderOptions
	} = options;
	try {
		const result = hydration
			? await renderToHydratableStringAsync(vnode, {
					...renderOptions,
					...hydration,
					contexts,
					onComponentRendered: capture
				})
			: await renderToStringAsync(vnode, {
					...renderOptions,
					contexts,
					onComponentRendered: capture
				});
		return new ServerTestView(
			result.html,
			captured,
			'hydrationScript' in result && typeof result.hydrationScript === 'string'
				? result.hydrationScript
				: undefined,
			'htmlWithHydration' in result && typeof result.htmlWithHydration === 'string'
				? result.htmlWithHydration
				: undefined,
			applicationValues,
			requestValues
		);
	} finally {
		await opened.dispose('eXact server test render complete');
		await runtime.dispose('eXact server test complete');
	}
}

function requireOne<T>(values: readonly T[], label: string): T {
	if (values.length !== 1)
		throw new Error(`Expected exactly one ${label}, but found ${values.length}`);
	return values[0]!;
}
