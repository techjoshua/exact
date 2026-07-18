import type { ComponentContextValues, ContextToken, Logger } from "@exact/core";
import type {
  RequestContextValue,
  RequestResponseState
} from "@exact/request";
import type { ExactOutputExtension } from "@exact/plugin-api";

export type ExactInvocationKind = "action" | "refresh";

export type ExactServerManifest = {
  version: 1;
  pluginRegistryFingerprint?: string;
  endpoint?: string;
  endpoints?: ExactEndpointRoutes;
  actions?: Record<string, ExactManifestAction>;
  boundaries?: Record<string, ExactManifestBoundary>;
  actionBoundaries?: Record<string, string[]>;
};

export type ExactEndpointRoutes = {
  actions?: Record<string, string>;
  boundaries?: Record<string, string>;
};

export type ExactManifestAction = {
  id: string;
  componentId?: string;
  taskId?: string;
  placement?: "server" | "isomorphic";
  stateContract?: ExactStateContract;
  contextContract?: ExactContextEffect[];
};

export type ExactManifestBoundary = {
  id: string;
  name?: string;
  componentId?: string;
  ownerComponentId?: string;
  renderEdgeId?: string;
  renderEdgeIndex?: number;
  renderPath?: string;
  kind?: string;
};

export type ExactStateContract = {
  reads?: ExactStatePath[];
  writes?: ExactStatePath[];
};

export type ExactContextEffect = {
  token: string;
  kind: "read" | "write";
  confidence: "exact" | "unknown";
};

export type ExactStatePath = {
  path: string;
  kind: "read" | "write";
  confidence: "exact" | "broad" | "unknown";
};

export type ExactCompilerManifestLike = {
  version: 7;
  pluginRegistry?: {
    fingerprint: string;
  };
  serverActions?: Record<string, {
    id: string;
    componentId?: string;
    taskId?: string;
    placement?: "server" | "isomorphic" | "client" | "unknown";
    stateContract?: ExactStateContract;
    contextContract?: ExactContextEffect[];
  }>;
  components?: readonly {
    id: string;
    placement?: "server" | "isomorphic" | "client" | "unknown";
  }[];
  boundaries?: readonly {
    id: string;
    name?: string;
    componentId?: string;
    ownerComponentId?: string;
    renderEdgeId?: string;
    renderEdgeIndex?: number;
    renderPath?: string;
    kind?: string;
  }[];
};

export type CreateExactServerManifestOptions = {
  endpoint?: string;
  endpoints?: ExactEndpointRoutes;
  actions?: Record<string, ExactManifestAction>;
  boundaries?: Record<string, ExactManifestBoundary>;
};

export type ExactRequestLike = {
  method: string;
  url?: string | URL;
  headers?: Headers | Record<string, string | string[] | undefined>;
  body?: unknown;
  text?(): Promise<string>;
  json?(): Promise<unknown>;
  signal?: AbortSignal;
  /** Adapter-owned original request object; never read from the invocation body. */
  platformRequest?: unknown;
};

export type ExactContextFactoryContext = {
  scope: "application" | "request";
  signal: AbortSignal;
  request?: RequestContextValue;
  platformRequest?: unknown;
  get<T>(token: ContextToken<T>): Promise<T>;
};

export type ExactContextFactory<T> = {
  create(context: ExactContextFactoryContext): T | Promise<T>;
  dispose?(value: T, reason?: unknown): void | Promise<void>;
};

export type ExactContextValue<T> = {
  value: T;
};

export type ExactContextRegistration<T = unknown> = readonly [
  token: ContextToken<T>,
  source: ExactContextValue<T> | ExactContextFactory<T>
];

export type ExactRequestContextRegistrationSource =
  | readonly ExactContextRegistration<any>[]
  | ((
    context: ExactContextFactoryContext
  ) => readonly ExactContextRegistration<any>[] | Promise<readonly ExactContextRegistration<any>[]>);

export type ExactContextOverrides = {
  /** Trusted application-supplied test values; never populated from request data. */
  application?: readonly (readonly [ContextToken<any>, unknown])[];
  /** Trusted application-supplied test values; never populated from request data. */
  request?: readonly (readonly [ContextToken<any>, unknown])[];
};

export type ExactServerContextConfiguration = {
  applicationContexts?: readonly ExactContextRegistration<any>[];
  requestContexts?: ExactRequestContextRegistrationSource;
  contextOverrides?: ExactContextOverrides;
};

export type ExactContextScope = {
  readonly kind: "application" | "request";
  readonly componentValues: ComponentContextValues;
  get<T>(token: ContextToken<T>): Promise<T>;
  getSync<T>(token: ContextToken<T>): T;
};

export type ExactContextRuntime = {
  open(
    request: ExactRequestLike,
    platformRequest?: unknown
  ): Promise<{
    context: ExactContextScope;
    request: RequestContextValue;
    response: RequestResponseState;
    dispose(reason?: unknown): Promise<void>;
  }>;
  dispose(reason?: unknown): Promise<void>;
};

export type ExactResponseLike = {
  status: number;
  headers: Record<string, string>;
  body: string;
  stream?: ReadableStream<Uint8Array>;
};

export type ExactInvocationRequest = {
  type: ExactInvocationKind;
  id: string;
  opId?: string;
  dependsOn?: string[];
  payload?: unknown;
  state?: unknown;
  context?: Record<string, unknown>;
  boundaryHtml?: string;
  boundaryHtmls?: Record<string, string>;
};

export type ExactBatchRequest = {
  type: "batch";
  version?: 1;
  operations: ExactInvocationRequest[];
};

export type ExactInvocationResult = {
  patches?: ExactPatch[];
  state?: unknown;
  html?: string;
};

export type ExactOperationSuccess = {
  ok: true;
  type: ExactInvocationKind;
  id: string;
  opId?: string;
} & ExactInvocationResult;

export type ExactOperationError = {
  ok: false;
  type: ExactInvocationKind;
  id: string;
  opId?: string;
  status: number;
  error: "bad_request" | "not_found" | "forbidden" | "internal_error" | "dependency_failed";
};

export type ExactOperationResult = ExactOperationSuccess | ExactOperationError;

export type ExactBatchResult = {
  ok: true;
  version: 1;
  results: ExactOperationResult[];
};

export type ExactStreamEvent =
  | { event: "start"; version: 1; operations: number }
  | { event: "patch"; version: 1; index: number; type: ExactInvocationKind; id: string; opId?: string; patch: ExactPatch }
  | { event: "state"; version: 1; index: number; type: ExactInvocationKind; id: string; opId?: string; value: unknown }
  | { event: "html"; version: 1; index: number; type: ExactInvocationKind; id: string; opId?: string; html: string }
  | { event: "result"; version: 1; index: number; result: ExactOperationResult }
  | { event: "complete"; version: 1 };

export type ExactPatch =
  | { type: "text"; id: string; value: string }
  | { type: "prop"; id: string; name: string; value: unknown }
  | { type: "style"; id: string; name: string; value: string | null }
  | { type: "list"; id: string; op: "insert" | "move" | "remove"; key: string; before?: string; html?: string }
  | { type: "state"; id: string; value: unknown }
  | { type: "replace"; id: string; html: string };

export type ExactServerContext = ExactServerContextConfiguration & {
  manifest: ExactServerManifest;
  actions?: Record<string, (input: ExactInvocationRequest, context: ExactServerContext) => Promise<ExactInvocationResult> | ExactInvocationResult>;
  refreshBoundaries?: Record<string, (input: ExactInvocationRequest, context: ExactServerContext) => Promise<ExactInvocationResult> | ExactInvocationResult>;
  authorize?(
    request: ExactRequestLike,
    input: ExactInvocationRequest | ExactBatchRequest,
    context: ExactServerContext
  ): Promise<boolean> | boolean;
  validateCsrf?(
    request: ExactRequestLike,
    input: ExactInvocationRequest | ExactBatchRequest,
    context: ExactServerContext
  ): Promise<boolean> | boolean;
  logger?: Logger;
  outputExtensions?: readonly ExactOutputExtension[];
  /** Resource ceilings applied before and during batch dispatch. */
  limits?: {
    /** Maximum operations accepted in one batch. Defaults to 100. */
    maxBatchOperations?: number;
    /** Maximum operations dispatched concurrently. Defaults to 8. */
    maxBatchConcurrency?: number;
    /** Maximum JSON graph depth accepted or emitted. Defaults to 100. */
    maxJsonDepth?: number;
    /** Maximum values and object properties traversed per JSON graph. Defaults to 100,000. */
    maxJsonNodes?: number;
    /** Maximum approximate UTF-8 bytes in one request envelope. Defaults to 4 MiB. */
    maxRequestBytes?: number;
    /** Maximum UTF-8 bytes in one non-stream response. Defaults to 16 MiB. */
    maxResponseBytes?: number;
    /** Maximum patches returned by one operation. Defaults to 10,000. */
    maxPatches?: number;
    /** Maximum events emitted by one stream. Defaults to 100,000. */
    maxStreamEvents?: number;
    /** Maximum encoded bytes emitted by one stream. Defaults to 16 MiB. */
    maxStreamBytes?: number;
  };
  /** Aborts when the current request or response stream is cancelled. */
  signal?: AbortSignal;
  /** Shared application/request context runtime. */
  contextRuntime?: ExactContextRuntime;
  /** Present only while trusted request-scoped work is executing. */
  contexts?: ExactContextScope;
  /** Portable request data for the active trusted scope. */
  requestContext?: RequestContextValue;
  /** Adapter-owned original request, never client-provided invocation context. */
  platformRequest?: unknown;
  /** Request-owned response mutations recorded before response commit. */
  responseState?: RequestResponseState;
  /** Disposes application-scoped resources owned by this server runtime. */
  dispose?(): Promise<void>;
};

export type ExactHydrationManifestConfig = {
  pluginRegistryFingerprint?: string;
  endpoint?: string;
  endpoints?: ExactEndpointRoutes;
  state?: unknown;
  stateContracts?: Record<string, ExactStateContract>;
  actionBoundaries?: Record<string, readonly string[]>;
};
