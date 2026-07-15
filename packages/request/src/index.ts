import { createContext, type Child, type Component } from "@exact/core";

export type RequestContextValue = {
  url: URL;
  redirect?(location: string | URL, status?: number): void;
};

export interface RequestContextStorage {
  run<T>(value: RequestContextValue, callback: () => T): T;
  getStore(): RequestContextValue | undefined;
}

export interface RequestScope {
  run<T>(value: RequestContextValue, callback: () => T): T;
  current(): RequestContextValue | undefined;
}

export const RequestContext = createContext<RequestContextValue>("exact.request", true);

class StackStorage implements RequestContextStorage {
  private readonly stack: RequestContextValue[] = [];

  run<T>(value: RequestContextValue, callback: () => T): T {
    this.stack.push(value);
    try {
      const result = callback();
      if (isPromiseLike(result)) {
        void Promise.resolve(result).catch(() => undefined);
        throw new Error("The default eXact request storage is synchronous; configure async-safe storage before using an async request scope");
      }
      return result;
    }
    finally { this.stack.pop(); }
  }

  getStore(): RequestContextValue | undefined {
    return this.stack.at(-1);
  }
}

let defaultStorage: RequestContextStorage = new StackStorage();

export function createRequestScope(storage: RequestContextStorage = new StackStorage()): RequestScope {
  return {
    run: (value, callback) => storage.run(value, callback),
    current: () => storage.getStore()
  };
}

/** Installs the ambient storage used by runWithRequestContext and Router SSR lookup. */
export function configureRequestContextStorage(storage: RequestContextStorage): void {
  defaultStorage = storage;
}

export function runWithRequestContext<T>(value: RequestContextValue, callback: () => T, scope?: RequestScope): T {
  return scope ? scope.run(value, callback) : defaultStorage.run(value, callback);
}

export function getRequestContext(scope?: RequestScope): RequestContextValue | undefined {
  return scope ? scope.current() : defaultStorage.getStore();
}

export type RequestProviderProps = {
  value?: RequestContextValue;
  children?: Child | Child[];
};

/** Publishes an explicit or ambient request value to descendant components. */
export function RequestProvider(this: Component<{}>, props: RequestProviderProps) {
  const value = props.value ?? getRequestContext();
  if (!value) throw new Error("RequestProvider requires an explicit value or active ambient request context");
  this.setContext(RequestContext, value);
  return () => props.children;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return !!value && (typeof value === "object" || typeof value === "function") && typeof (value as PromiseLike<unknown>).then === "function";
}
