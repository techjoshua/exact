import type {
  Child,
  ComponentFunction,
  ComponentInstance,
  Logger,
  TaskObserver,
  VNode
} from "@exact/core";
import type {
  ExactEndpointRoutes,
  ExactInvocationRequest,
  ExactInvocationResult,
  ExactResponseLike,
  ExactServerContext,
  ExactServerManifest,
  ExactStateContract
} from "@exact/server";

export type RenderToStringOptions = {
  markers?: boolean;
  logger?: Logger;
  state?: unknown;
  maxTaskPasses?: number;
  /** Total wall-clock budget for all async component tasks in one render. Defaults to 30 seconds. */
  maxTaskDurationMs?: number;
  /** Maximum nested vnode depth. Defaults to 512 and is capped at 1,024. */
  maxTreeDepth?: number;
  /** Maximum vnode and primitive child values visited by one render. Defaults to 100,000. */
  maxTreeNodes?: number;
  /** Maximum UTF-8 bytes in a checked string render. Defaults to 16 MiB. */
  maxOutputBytes?: number;
  /** Maximum bytes emitted by a plain HTML stream. Defaults to 16 MiB. */
  maxStreamBytes?: number;
  /** Maximum chunks emitted by a plain HTML stream. Defaults to 100,000. */
  maxStreamChunks?: number;
  signal?: AbortSignal;
};

export type RenderToStringResult = {
  html: string;
  state?: unknown;
};

export type HydrationScriptOptions = {
  endpoint?: string;
  endpoints?: ExactEndpointRoutes;
  state?: unknown;
  stateContracts?: Record<string, ExactStateContract>;
  actionBoundaries?: Record<string, readonly string[]>;
  scriptId?: string;
  nonce?: string;
  /** Maximum hydration JSON graph depth. Defaults to 100. */
  maxHydrationDepth?: number;
  /** Maximum hydration JSON values/properties. Defaults to 100,000. */
  maxHydrationNodes?: number;
  /** Maximum encoded hydration JSON bytes. Defaults to 16 MiB. */
  maxHydrationBytes?: number;
};

export type HydratableStringResult = RenderToStringResult & {
  hydrationScript: string;
  htmlWithHydration: string;
};

export type RenderToDocumentStreamOptions = RenderToStringOptions & HydrationScriptOptions & {
  rootId?: string;
  hydration?: boolean;
  maxStreamEvents?: number;
};

export type RenderToProgressiveHtmlStreamOptions = RenderToDocumentStreamOptions & {
  rootId?: string;
};

export type RenderToProgressiveHtmlResponseOptions = RenderToProgressiveHtmlStreamOptions & {
  status?: number;
  headers?: Record<string, string>;
  contentType?: string;
};

export type ExactDocumentStreamEvent =
  | { event: "start"; version: 1 }
  | { event: "shell"; version: 1; html: string }
  | { event: "replace"; version: 1; id: string; html: string }
  | { event: "hydration"; version: 1; html: string }
  | { event: "complete"; version: 1 }
  | { event: "error"; version: 1; message: string };

export type BoundaryRenderFunction = (
  input: ExactInvocationRequest,
  context: ExactServerContext
) => VNode | Promise<VNode>;

export type BoundaryRefreshOptions = RenderToStringOptions & {
  boundaryId: string;
  patchStrategy?: "replace" | "text" | "element";
  previousHtml?(input: ExactInvocationRequest, context: ExactServerContext): string | Promise<string | undefined> | undefined;
};

export type ActionRefreshBoundaryOptions = BoundaryRefreshOptions & {
  render: BoundaryRenderFunction;
};

export type ActionRefreshOptions = {
  action(input: ExactInvocationRequest, context: ExactServerContext): Promise<ExactInvocationResult | void> | ExactInvocationResult | void;
  boundaries: readonly ActionRefreshBoundaryOptions[];
};

export type ExactBoundaryRenderer =
  | BoundaryRenderFunction
  | (Partial<BoundaryRefreshOptions> & { render: BoundaryRenderFunction });

export type ExactServerHandlerRegistryOptions = RenderToStringOptions & {
  manifest: ExactServerManifest;
  actions?: Record<string, (input: ExactInvocationRequest, context: ExactServerContext) => Promise<ExactInvocationResult | void> | ExactInvocationResult | void>;
  boundaries?: Record<string, ExactBoundaryRenderer>;
  patchStrategy?: BoundaryRefreshOptions["patchStrategy"];
};

export type ExactServerHandlerRegistry = {
  actions: NonNullable<ExactServerContext["actions"]>;
  refreshBoundaries: NonNullable<ExactServerContext["refreshBoundaries"]>;
};

export type ExactServerRuntimeOptions = ExactServerHandlerRegistryOptions & {
  authorize?: ExactServerContext["authorize"];
  validateCsrf?: ExactServerContext["validateCsrf"];
};

export type KeyedListSnapshotItem = {
  key: string;
  html: string;
};

export type KeyedListSnapshot = {
  listId: string;
  html: string;
  innerHtml: string;
  items: KeyedListSnapshotItem[];
};

export type KeyedListSnapshotOptions<T> = RenderToStringOptions & {
  listId: string;
  items: Iterable<T>;
  key(item: T): string;
  render(item: T): VNode;
};

export type KeyedListRefreshOptions<T> = RenderToStringOptions & {
  listId: string;
  key(item: T): string;
  render(item: T): VNode;
  items(input: ExactInvocationRequest, context: ExactServerContext): Iterable<T> | Promise<Iterable<T>>;
  previousItems?(input: ExactInvocationRequest, context: ExactServerContext): readonly KeyedListSnapshotItem[] | Promise<readonly KeyedListSnapshotItem[] | undefined> | undefined;
};

export type SsrContext = {
  markers: boolean;
  nextId: number;
  logger?: Logger;
  maxTreeDepth: number;
  traversalDepth: number;
  maxTreeNodes: number;
  traversedNodes: number;
  maxOutputBytes: number;
};

export type { Child, ComponentFunction, ComponentInstance, Logger, TaskObserver, VNode };
export type { ExactInvocationRequest, ExactInvocationResult, ExactResponseLike, ExactServerContext };
