import { createContext, type Child, type Component } from "@exact/core";
import { createSelectedExternalSource, unwrap, type ExternalSource } from "@exact/reactive";

export interface ReduxStore<State = unknown, Action = unknown> {
  dispatch(action: Action): unknown;
  getState(): State;
  subscribe(listener: () => void): () => void;
}

export const ReduxStoreContext = createContext<ReduxStore<any, any>>("exact.redux.store", { reactive: false });
export const ReduxServerStateContext = createContext<unknown>("exact.redux.server-state", { reactive: false });

export interface ExactReduxProviderProps<State = unknown, Action = unknown> {
  readonly store: ReduxStore<State, Action>;
  readonly children?: Child | readonly Child[];
  readonly context?: unknown;
  readonly serverState?: State;
}

export function ExactReduxProvider(this: Component<Record<string, unknown>>, props: ExactReduxProviderProps) {
  const store = unwrap(props.store);
  if (props.context !== undefined) throw new Error("@exact/redux does not substitute react-redux custom contexts; use ReduxStoreContext");
  this.setContext(ReduxStoreContext, store);
  if (props.serverState !== undefined) this.setContext(ReduxServerStateContext, props.serverState);
  return () => props.children ?? null;
}

export interface ReduxCompatibilitySubscription {
  addNestedSub(listener: () => void): () => void;
  notifyNestedSubs(): void;
  handleChangeWrapper(): void;
  isSubscribed(): boolean;
  trySubscribe(): void;
  tryUnsubscribe(): void;
  getListeners(): { subscribe(listener: () => void): () => void; notify(): void; get(): readonly (() => void)[] };
}

/** Framework-neutral subscription contract consumed by optional React Redux custom contexts. */
export function createReduxSubscription(store: ReduxStore<any, any>): ReduxCompatibilitySubscription {
  const listeners = new Set<() => void>();
  let unsubscribe: (() => void) | undefined;
  const subscription: ReduxCompatibilitySubscription = {
    addNestedSub(listener) { subscription.trySubscribe(); listeners.add(listener); return () => listeners.delete(listener); },
    notifyNestedSubs() { for (const listener of [...listeners]) listener(); },
    handleChangeWrapper() { subscription.notifyNestedSubs(); },
    isSubscribed: () => unsubscribe !== undefined,
    trySubscribe() { unsubscribe ??= store.subscribe(subscription.handleChangeWrapper); },
    tryUnsubscribe() { unsubscribe?.(); unsubscribe = undefined; listeners.clear(); },
    getListeners: () => ({
      subscribe: listener => subscription.addNestedSub(listener),
      notify: () => subscription.notifyNestedSubs(),
      get: () => [...listeners]
    })
  };
  return subscription;
}

export function createReduxSource<State, Selected = State>(
  store: ReduxStore<State, any>,
  selector: (state: State) => Selected = identity as (state: State) => Selected,
  equality: (left: Selected, right: Selected) => boolean = Object.is,
  serverState?: State
): ExternalSource<Selected> {
  return createSelectedExternalSource({
    getSnapshot: () => store.getState(),
    ...(serverState === undefined ? {} : { getServerSnapshot: () => serverState }),
    subscribe: notify => store.subscribe(notify),
    selector,
    isEqual: equality
  });
}

export function createComponentSelector<State, Selected = State>(
  component: Component<any>,
  selector?: (state: State) => Selected,
  equality?: (left: Selected, right: Selected) => boolean
): ExternalSource<Selected> {
  let serverState: State | undefined;
  try { serverState = component.getContext(ReduxServerStateContext) as State; } catch {}
  const source = createReduxSource(component.getContext(ReduxStoreContext) as ReduxStore<State>, selector, equality, serverState);
  component.onUnmount(source.dispose);
  return source;
}

function identity<T>(value: T): T { return value; }
