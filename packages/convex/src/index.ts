import { createContext, type Child, type Component } from "@exact/core";
import { createExternalSource, type ExternalSource } from "@exact/reactive";

export interface ConvexWatch<Value> {
  localQueryResult(): Value | undefined;
  onUpdate(callback: () => void): () => void;
}

export interface ConvexClient {
  watchQuery<Value>(query: unknown, ...argsAndOptions: unknown[]): ConvexWatch<Value>;
  mutation?<Value>(mutation: unknown, ...argsAndOptions: unknown[]): Promise<Value>;
  action?<Value>(action: unknown, ...args: unknown[]): Promise<Value>;
  setAuth?(fetchToken: () => Promise<string | null>, onChange: (isAuthenticated: boolean) => void): void;
  clearAuth?(): void;
  connectionState?(): unknown;
  subscribeToConnectionState?(callback: () => void): () => void;
}

export const ConvexClientContext = createContext<ConvexClient>("exact.convex.client", { reactive: false });

export interface ExactConvexProviderProps {
  readonly client: ConvexClient;
  readonly children?: Child | readonly Child[];
}

export function ExactConvexProvider(this: Component<Record<string, unknown>>, props: ExactConvexProviderProps) {
  this.setContext(ConvexClientContext, props.client);
  return () => props.children ?? null;
}

/** Creates a lifecycle-independent reactive query watch. */
export function createConvexQuery<Value>(client: ConvexClient, query: unknown, ...argsAndOptions: unknown[]): ExternalSource<Value | undefined> {
  const watch = client.watchQuery<Value>(query, ...argsAndOptions);
  return createExternalSource({
    getSnapshot: () => watch.localQueryResult(),
    subscribe: notify => watch.onUpdate(notify)
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
    subscribe: notify => watch.onUpdate(notify)
  });
}

export function convexMutation<Value>(client: ConvexClient, mutation: unknown, ...argsAndOptions: unknown[]): Promise<Value> {
  if (!client.mutation) throw new Error("This Convex client does not support mutations");
  return client.mutation<Value>(mutation, ...argsAndOptions);
}

export function convexAction<Value>(client: ConvexClient, action: unknown, ...args: unknown[]): Promise<Value> {
  if (!client.action) throw new Error("This Convex client does not support actions");
  return client.action<Value>(action, ...args);
}

export function configureConvexAuth(
  client: ConvexClient,
  fetchToken: () => Promise<string | null>,
  onChange: (isAuthenticated: boolean) => void = () => {}
): () => void {
  if (!client.setAuth || !client.clearAuth) throw new Error("This Convex client does not support auth configuration");
  client.setAuth(fetchToken, onChange);
  return () => client.clearAuth!();
}

export function createConvexConnectionSource<State = unknown>(client: ConvexClient): ExternalSource<State> {
  if (!client.connectionState || !client.subscribeToConnectionState) {
    throw new Error("This Convex client does not expose connection-state subscriptions");
  }
  return createExternalSource({
    getSnapshot: () => client.connectionState!() as State,
    subscribe: notify => client.subscribeToConnectionState!(notify)
  });
}

export function createComponentConvexQuery<Value>(
  component: Component<any>,
  query: unknown,
  ...argsAndOptions: unknown[]
): ExternalSource<Value | undefined> {
  const source = createConvexQuery<Value>(component.getContext(ConvexClientContext), query, ...argsAndOptions);
  component.onUnmount(source.dispose);
  return source;
}
