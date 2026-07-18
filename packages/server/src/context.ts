import {
  attachSuppressedCleanupFailure,
  type ComponentContextValues,
  type ContextToken
} from "@exact/core";
import {
  RequestContext,
  createRequestContextValue,
  type RequestContextValue,
  type RequestResponseState
} from "@exact/request";
import type {
  ExactContextFactory,
  ExactContextFactoryContext,
  ExactContextRegistration,
  ExactContextRuntime,
  ExactContextScope,
  ExactRequestLike,
  ExactResponseLike,
  ExactServerContext,
  ExactServerContextConfiguration
} from "./types.js";

type AnyRegistration = ExactContextRegistration<any>;
type ScopeKind = "application" | "request";

type OwnedValue = {
  token: ContextToken<any>;
  value: unknown;
  factory: ExactContextFactory<any>;
};

class ContextScope implements ExactContextScope {
  readonly values = new Map<symbol, unknown>();
  readonly componentValues: ComponentContextValues;
  private readonly providers = new Map<symbol, AnyRegistration>();
  private readonly providerOrder: symbol[] = [];
  private readonly owned = new Map<symbol, OwnedValue>();
  private readonly dependencies = new Map<symbol, Set<symbol>>();
  private readonly inFlight = new Map<symbol, Promise<unknown>>();
  private disposed = false;

  constructor(
    readonly kind: ScopeKind,
    registrations: readonly AnyRegistration[],
    private readonly signal: AbortSignal,
    private readonly parent?: ContextScope,
    initialValues: readonly (readonly [ContextToken<any>, unknown])[] = [],
    private readonly request?: RequestContextValue,
    private readonly platformRequest?: unknown
  ) {
    for (const [token, value] of initialValues) this.values.set(token.id, value);
    for (const registration of registrations) {
      const [token] = registration;
      if (token.scope !== kind) {
        throw new Error(
          `Context "${token.description}" declares ${token.scope} scope and cannot be registered as ${kind}-scoped`
        );
      }
      if (this.providers.has(token.id) || this.values.has(token.id)) {
        throw new Error(`Context "${token.description}" is registered more than once in ${kind} scope`);
      }
      this.providers.set(token.id, registration);
      this.providerOrder.push(token.id);
    }
    const inherited = parent ? parent.componentValues : undefined;
    const componentValues = new Map(inherited);
    for (const [token, value] of initialValues) componentValues.set(token.id, value);
    this.componentValues = componentValues;
  }

  async initialize(): Promise<void> {
    try {
      for (const [token] of this.providers.values()) await this.resolve(token);
    } catch (error) {
      try {
        await this.dispose(error);
      } catch (cleanup) {
        attachSuppressedCleanupFailure(error, cleanup);
      }
      throw error;
    }
  }

  async get<T>(token: ContextToken<T>): Promise<T> {
    return this.resolve(token);
  }

  getSync<T>(token: ContextToken<T>): T {
    if (this.values.has(token.id)) return this.values.get(token.id) as T;
    if (this.parent) return this.parent.getSync(token);
    throw new Error(`Context "${token.description}" has not been initialized in this server scope`);
  }

  async dispose(reason?: unknown): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const failures: unknown[] = [];
    for (const owned of this.disposalOrder()) {
      try {
        await disposeOwnedValue(owned, reason);
      } catch (error) {
        failures.push(error);
      }
    }
    this.owned.clear();
    this.values.clear();
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, `Failed to dispose ${this.kind} contexts`);
  }

  private async resolve<T>(
    token: ContextToken<T>,
    path: readonly ContextToken<any>[] = []
  ): Promise<T> {
    if (this.disposed) throw new Error(`Cannot read disposed ${this.kind} context scope`);
    if (this.values.has(token.id)) return this.values.get(token.id) as T;
    const cycleStart = path.findIndex(item => item.id === token.id);
    if (cycleStart >= 0) {
      const cycle = [...path.slice(cycleStart), token]
        .map(item => item.description)
        .join(" -> ");
      throw new Error(`Server context dependency cycle: ${cycle}`);
    }
    const pending = this.inFlight.get(token.id);
    if (pending) return pending as Promise<T>;
    const registration = this.providers.get(token.id);
    if (!registration) {
      if (this.parent) return this.parent.resolve(token, path);
      throw new Error(`Context "${token.description}" is not registered in the server scope`);
    }

    const resolution = this.resolveRegistration(token, registration, path);
    this.inFlight.set(token.id, resolution);
    try {
      return await resolution;
    } finally {
      this.inFlight.delete(token.id);
    }
  }

  private async resolveRegistration<T>(
    token: ContextToken<T>,
    registration: ExactContextRegistration<T>,
    path: readonly ContextToken<any>[]
  ): Promise<T> {
    const source = registration[1];
    let value: T;
    if (isFactory(source)) {
      const dependencies = this.dependencies.get(token.id) ?? new Set<symbol>();
      this.dependencies.set(token.id, dependencies);
      const context: ExactContextFactoryContext = {
        scope: this.kind,
        signal: this.signal,
        request: this.request,
        platformRequest: this.platformRequest,
        get: dependency => {
          dependencies.add(dependency.id);
          return this.resolve(dependency, [...path, token]);
        }
      };
      const creation = Promise.resolve().then(() => source.create(context));
      try {
        value = await awaitWithAbort(creation, this.signal);
      } catch (error) {
        if (this.signal.aborted) {
          void creation.then(
            lateValue => disposeOwnedValue(
              { token, value: lateValue, factory: source },
              this.signal.reason
            ),
            () => undefined
          ).catch(() => undefined);
        }
        throw error;
      }
      if (this.signal.aborted) {
        await disposeOwnedValue({ token, value, factory: source }, this.signal.reason);
        throw abortReason(this.signal);
      }
      this.owned.set(token.id, { token, value, factory: source });
    } else {
      value = source.value;
    }
    this.values.set(token.id, value);
    (this.componentValues as Map<symbol, unknown>).set(token.id, value);
    return value;
  }

  private disposalOrder(): OwnedValue[] {
    const initialized = new Set(this.owned.keys());
    const visited = new Set<symbol>();
    const creationOrder: symbol[] = [];
    const visit = (id: symbol) => {
      if (visited.has(id) || !initialized.has(id)) return;
      visited.add(id);
      for (const dependency of this.dependencies.get(id) ?? []) visit(dependency);
      creationOrder.push(id);
    };
    for (const id of this.providerOrder) visit(id);
    return creationOrder.reverse().map(id => this.owned.get(id)!);
  }
}

class ContextRuntime implements ExactContextRuntime {
  private readonly applicationAbort = new AbortController();
  private readonly activeRequests = new Set<(reason?: unknown) => Promise<void>>();
  private application?: ContextScope;
  private initializing?: Promise<ContextScope>;
  private disposed = false;

  constructor(private readonly configuration: ExactServerContextConfiguration) {}

  async open(
    request: ExactRequestLike,
    platformRequest: unknown = request
  ): Promise<{
    context: ExactContextScope;
    request: RequestContextValue;
    response: RequestResponseState;
    dispose(reason?: unknown): Promise<void>;
  }> {
    if (this.disposed) throw new Error("Cannot open a request on a disposed eXact context runtime");
    const application = await this.applicationScope();
    const lifetime = createRequestLifetime(request.signal, this.applicationAbort.signal);
    const response: RequestResponseState = { headers: new Headers() };
    const requestValue = createRequestContextValue({
      url: request.url,
      method: request.method,
      headers: request.headers,
      signal: lifetime.signal,
      locale: headerValue(request.headers, "accept-language")?.split(",")[0]?.trim(),
      traceId: headerValue(request.headers, "traceparent")
        ?? headerValue(request.headers, "x-request-id")
    }, response);
    const sourceContext: ExactContextFactoryContext = {
      scope: "request",
      signal: requestValue.signal,
      request: requestValue,
      platformRequest,
      get: token => application.get(token)
    };
    let scope: ContextScope | undefined;
    try {
      const configured = typeof this.configuration.requestContexts === "function"
        ? await awaitWithAbort(
          Promise.resolve(this.configuration.requestContexts(sourceContext)),
          requestValue.signal
        )
        : this.configuration.requestContexts ?? [];
      const overrides = this.configuration.contextOverrides?.request ?? [];
      const registrations = applyOverrides(configured, overrides, "request");
      scope = new ContextScope(
        "request",
        registrations,
        requestValue.signal,
        application,
        [[RequestContext, requestValue]],
        requestValue,
        platformRequest
      );
      await scope.initialize();
      if (requestValue.signal.aborted) {
        await scope.dispose(requestValue.signal.reason);
        throw abortReason(requestValue.signal);
      }
    } catch (error) {
      lifetime.abort(error);
      lifetime.dispose();
      throw error;
    }
    let closing: Promise<void> | undefined;
    let registeredDispose!: (reason?: unknown) => Promise<void>;
    const close = (reason: unknown = "eXact request complete"): Promise<void> => {
      if (closing) return closing;
      closing = (async () => {
        this.activeRequests.delete(registeredDispose);
        lifetime.abort(reason);
        try {
          await scope.dispose(reason);
        } finally {
          lifetime.dispose();
        }
      })();
      return closing;
    };
    const abort = () => {
      void close(requestValue.signal.reason).catch(() => undefined);
    };
    requestValue.signal.addEventListener("abort", abort, { once: true });
    const closeWithListener = async (reason?: unknown) => {
      requestValue.signal.removeEventListener("abort", abort);
      await close(reason);
    };
    registeredDispose = closeWithListener;
    this.activeRequests.add(closeWithListener);
    return {
      context: scope,
      request: requestValue,
      response,
      dispose: closeWithListener
    };
  }

  async dispose(reason = "eXact server runtime disposed"): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const activeRequests = [...this.activeRequests];
    this.applicationAbort.abort(reason);
    const requestResults = await Promise.allSettled(
      activeRequests.map(dispose => dispose(reason))
    );
    const application = this.application ?? await this.initializing?.catch(() => undefined);
    let applicationFailure: unknown;
    try {
      await application?.dispose(reason);
    } catch (error) {
      applicationFailure = error;
    }
    this.application = undefined;
    const failures = requestResults
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map(result => result.reason);
    if (applicationFailure !== undefined) failures.push(applicationFailure);
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "Failed to dispose eXact server contexts");
  }

  private async applicationScope(): Promise<ContextScope> {
    if (this.application) return this.application;
    if (this.initializing) return this.initializing;
    this.initializing = this.createApplicationScope();
    try {
      this.application = await this.initializing;
      return this.application;
    } finally {
      this.initializing = undefined;
    }
  }

  private async createApplicationScope(): Promise<ContextScope> {
    const configured = this.configuration.applicationContexts ?? [];
    const overrides = this.configuration.contextOverrides?.application ?? [];
    const scope = new ContextScope(
      "application",
      applyOverrides(configured, overrides, "application"),
      this.applicationAbort.signal
    );
    await scope.initialize();
    return scope;
  }
}

function createRequestLifetime(
  ...signals: Array<AbortSignal | undefined>
): {
  signal: AbortSignal;
  abort(reason?: unknown): void;
  dispose(): void;
} {
  const controller = new AbortController();
  const listeners = new Map<AbortSignal, () => void>();
  for (const signal of signals) {
    if (!signal) continue;
    const abort = () => controller.abort(signal.reason);
    if (signal.aborted) {
      abort();
      break;
    }
    listeners.set(signal, abort);
    signal.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    abort(reason) {
      controller.abort(reason);
    },
    dispose() {
      for (const [signal, listener] of listeners) {
        signal.removeEventListener("abort", listener);
      }
      listeners.clear();
    }
  };
}

const contextRuntimes = new WeakMap<ExactServerContext, ExactContextRuntime>();

export function createExactContextRuntime(
  configuration: ExactServerContextConfiguration = {}
): ExactContextRuntime {
  return new ContextRuntime(configuration);
}

/** Opens the trusted request scope used by SSR, actions, refreshes, and streams. */
export async function openExactRequestScope(
  request: ExactRequestLike,
  server: ExactServerContext,
  platformRequest: unknown = request
): Promise<{
  context: ExactServerContext;
  response: RequestResponseState;
  dispose(reason?: unknown): Promise<void>;
}> {
  if (server.requestContext && server.contexts) {
    return {
      context: server,
      response: server.responseState ?? { headers: new Headers() },
      async dispose() {}
    };
  }
  let runtime = server.contextRuntime ?? contextRuntimes.get(server);
  if (!runtime) {
    runtime = createExactContextRuntime(server);
    contextRuntimes.set(server, runtime);
  }
  const opened = await runtime.open(request, platformRequest);
  return {
    context: {
      ...server,
      contextRuntime: runtime,
      contexts: opened.context,
      requestContext: opened.request,
      responseState: opened.response,
      platformRequest,
      signal: opened.request.signal
    },
    response: opened.response,
    dispose: opened.dispose
  };
}

/**
 * Runs arbitrary server work inside the same trusted scope as endpoint
 * dispatch. Stream responses retain the scope until close or cancellation.
 */
export async function runWithExactRequestScope<T>(
  request: ExactRequestLike,
  server: ExactServerContext,
  work: (context: ExactServerContext) => T | Promise<T>,
  platformRequest: unknown = request
): Promise<T> {
  const opened = await openExactRequestScope(request, server, platformRequest);
  let value: T;
  let releaseAttempted = false;
  try {
    value = await work(opened.context);
  } catch (error) {
    await disposePreservingPrimary(opened.dispose, error);
    throw error;
  }
  try {
    if (isResponse(value) && value.stream) {
      value = {
        ...value,
        stream: retainScopeForStream(
          value.stream,
          opened.dispose,
          opened.context.signal
        )
      } as T;
    } else {
      releaseAttempted = true;
      await opened.dispose("eXact request complete");
    }
    if (isResponse(value)) applyResponseState(value, opened.response);
    return value;
  } catch (error) {
    if (!releaseAttempted) await disposePreservingPrimary(opened.dispose, error);
    throw error;
  }
}

export function applyResponseState(
  response: ExactResponseLike,
  state: RequestResponseState
): void {
  if (state.status !== undefined) response.status = state.status;
  state.headers.forEach((value, name) => {
    response.headers[name] = value;
  });
}

function applyOverrides(
  registrations: readonly AnyRegistration[],
  overrides: readonly (readonly [ContextToken<any>, unknown])[],
  scope: ScopeKind
): AnyRegistration[] {
  const result = new Map<symbol, AnyRegistration>();
  for (const registration of registrations) {
    const token = registration[0];
    if (result.has(token.id)) {
      throw new Error(`Context "${token.description}" is registered more than once in ${scope} scope`);
    }
    result.set(token.id, registration);
  }
  for (const [token, value] of overrides) {
    if (token.scope !== scope) {
      throw new Error(
        `Test override for "${token.description}" declares ${token.scope} scope, expected ${scope}`
      );
    }
    result.set(token.id, [token, { value }]);
  }
  return [...result.values()];
}

function isFactory<T>(
  value: { value: T } | ExactContextFactory<T>
): value is ExactContextFactory<T> {
  return !!value
    && typeof value === "object"
    && typeof (value as ExactContextFactory<T>).create === "function";
}

async function disposeOwnedValue(
  owned: OwnedValue,
  reason: unknown
): Promise<void> {
  if (owned.factory.dispose) {
    await owned.factory.dispose(owned.value, reason);
    return;
  }
  const value = owned.value as any;
  const asyncDispose = (Symbol as any).asyncDispose;
  const dispose = (Symbol as any).dispose;
  if (asyncDispose && typeof value?.[asyncDispose] === "function") {
    await value[asyncDispose]();
  } else if (dispose && typeof value?.[dispose] === "function") {
    value[dispose]();
  }
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(value => {
      if (settled) {
        // The owning scope observes the aborted signal after factory completion
        // and disposes late-created resources before rejecting.
        return;
      }
      settled = true;
      signal.removeEventListener("abort", abort);
      resolve(value);
    }, error => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("eXact request aborted", "AbortError");
}

function headerValue(
  headers: ExactRequestLike["headers"],
  name: string
): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== expected || value === undefined) continue;
    return Array.isArray(value) ? value.join(",") : value;
  }
  return undefined;
}

function isResponse(value: unknown): value is ExactResponseLike {
  return !!value
    && typeof value === "object"
    && typeof (value as ExactResponseLike).status === "number"
    && typeof (value as ExactResponseLike).headers === "object"
    && typeof (value as ExactResponseLike).body === "string";
}

function retainScopeForStream(
  stream: ReadableStream<Uint8Array>,
  dispose: (reason?: unknown) => Promise<void>,
  signal?: AbortSignal
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  let finished = false;
  let abort: (() => void) | undefined;
  const finish = async (reason: unknown) => {
    if (finished) return;
    finished = true;
    if (abort) signal?.removeEventListener("abort", abort);
    try {
      reader.releaseLock();
    } finally {
      await dispose(reason);
    }
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      abort = () => {
        const reason = signal?.reason ?? new DOMException("eXact response stream aborted", "AbortError");
        controller.error(reason);
        void reader.cancel(reason)
          .then(() => finish(reason))
          .catch(cleanup => attachSuppressedCleanupFailure(reason, cleanup));
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    },
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          await finish("eXact response stream complete");
          controller.close();
        } else {
          controller.enqueue(next.value);
        }
      } catch (error) {
        await disposePreservingPrimary(finish, error);
        controller.error(error);
      }
    },
    async cancel(reason) {
      let primary: unknown;
      try {
        await reader.cancel(reason);
      } catch (error) {
        primary = error;
      }
      if (primary !== undefined) {
        await disposePreservingPrimary(finish, primary);
        throw primary;
      }
      await finish(reason);
    }
  }, { highWaterMark: 0 });
}

async function disposePreservingPrimary(
  dispose: (reason?: unknown) => Promise<void>,
  primary: unknown
): Promise<void> {
  try {
    await dispose(primary);
  } catch (cleanup) {
    attachSuppressedCleanupFailure(primary, cleanup);
  }
}
