import { createContext, markExactComponent, type Child, type Component } from '@exactjs/core';
import { createExternalSource, type ExternalSource } from '@exactjs/reactive';

/** Defines the convex watch interface contract. */
export interface ConvexWatch<Value> {
	localQueryResult(): Value | undefined;
	onUpdate(callback: () => void): () => void;
}

/** Defines the convex client interface contract. */
export interface ConvexClient {
	watchQuery<Value>(query: unknown, ...argsAndOptions: unknown[]): ConvexWatch<Value>;
	mutation?<Value>(mutation: unknown, ...argsAndOptions: unknown[]): Promise<Value>;
	action?<Value>(action: unknown, ...args: unknown[]): Promise<Value>;
	setAuth?(
		fetchToken: () => Promise<string | null>,
		onChange: (isAuthenticated: boolean) => void
	): void;
	clearAuth?(): void;
	connectionState?(): unknown;
	subscribeToConnectionState?(callback: () => void): () => void;
}

/** Provides the canonical convex client context value. */
export const ConvexClientContext = createContext<ConvexClient>('exact.convex.client', {
	reactive: false
});

/** Defines the properties accepted by exact convex provider. */
export interface ExactConvexProviderProps {
	readonly client: ConvexClient;
	readonly children?: Child | readonly Child[];
}

/** Performs the exact convex provider domain operation. */
export function ExactConvexProvider(
	this: Component<Record<string, unknown>>,
	props: ExactConvexProviderProps
) {
	this.setContext(ConvexClientContext, props.client);
	return () => props.children ?? null;
}
markExactComponent(ExactConvexProvider, '@exactjs/convex:ExactConvexProvider');

/** Creates a lifecycle-independent reactive query watch. */
export function createConvexQuery<Value>(
	client: ConvexClient,
	query: unknown,
	...argsAndOptions: unknown[]
): ExternalSource<Value | undefined> {
	const watch = client.watchQuery<Value>(query, ...argsAndOptions);
	return createExternalSource({
		getSnapshot: () => watch.localQueryResult(),
		subscribe: (notify) => watch.onUpdate(notify)
	});
}

/** Creates a query source with an inert SSR seed and no server subscription. */
export function createSeededConvexQuery<Value>(
	client: ConvexClient,
	query: unknown,
	serverSnapshot: Value | undefined,
	...argsAndOptions: unknown[]
): ExternalSource<Value | undefined> {
	const watch = client.watchQuery<Value>(query, ...argsAndOptions);
	return createExternalSource({
		getSnapshot: () => watch.localQueryResult(),
		getServerSnapshot: () => serverSnapshot,
		subscribe: (notify) => watch.onUpdate(notify)
	});
}

/** Performs the convex mutation domain operation. */
export function convexMutation<Value>(
	client: ConvexClient,
	mutation: unknown,
	...argsAndOptions: unknown[]
): Promise<Value> {
	if (!client.mutation) throw new Error('This Convex client does not support mutations');
	return client.mutation<Value>(mutation, ...argsAndOptions);
}

/** Performs the convex action domain operation. */
export function convexAction<Value>(
	client: ConvexClient,
	action: unknown,
	...args: unknown[]
): Promise<Value> {
	if (!client.action) throw new Error('This Convex client does not support actions');
	return client.action<Value>(action, ...args);
}

/** Performs the configure convex auth domain operation. */
export function configureConvexAuth(
	client: ConvexClient,
	fetchToken: () => Promise<string | null>,
	onChange: (isAuthenticated: boolean) => void = () => {}
): () => void {
	if (!client.setAuth || !client.clearAuth)
		throw new Error('This Convex client does not support auth configuration');
	client.setAuth(fetchToken, onChange);
	return () => client.clearAuth!();
}

/** Creates a convex connection source. */
export function createConvexConnectionSource<State = unknown>(
	client: ConvexClient
): ExternalSource<State> {
	if (!client.connectionState || !client.subscribeToConnectionState) {
		throw new Error('This Convex client does not expose connection-state subscriptions');
	}
	return createExternalSource({
		getSnapshot: () => client.connectionState!() as State,
		subscribe: (notify) => client.subscribeToConnectionState!(notify)
	});
}

/** Creates a component convex query. */
export function createComponentConvexQuery<Value>(
	component: Component<any>,
	query: unknown,
	...argsAndOptions: unknown[]
): ExternalSource<Value | undefined> {
	const source = createConvexQuery<Value>(
		component.getContext(ConvexClientContext),
		query,
		...argsAndOptions
	);
	component.onUnmount(source.dispose);
	return source;
}
