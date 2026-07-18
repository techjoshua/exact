import type {
  ComponentFunction,
  ComponentInstance,
  ErrorContextValue,
  ErrorReport,
  Logger,
  StopHandle,
  UnsafeHtmlAuditEvent,
  VNode
} from "@exact/core";
import type { EffectScope } from "@exact/reactive";
import type { DomWorkBudget } from "./work.js";

export type Mounted = {
  vnode: VNode;
  dom: Node;
  /** Optional closing boundary marker when this subtree was adopted from SSR. */
  end?: Node;
  /** Marker range that wraps an ordinary keyed list item vnode. */
  range?: "item";
  scope: EffectScope;
  children: Mounted[];
  /** Physical parent for children whose logical parent remains elsewhere. */
  portalTarget?: Node;
  /** Runs once the subtree's source range has a physical parent. */
  afterPlacement?: () => void;
  rendering?: boolean;
  rerenderPending?: boolean;
  instance?: ComponentInstance<any>;
  delegatedEvents?: Map<string, EventListener>;
  stop?: StopHandle;
  /** Unmanaged nodes between an opaque raw-HTML range's boundary markers. */
  rawNodes?: Node[];
};

export type Root = {
  container: Element;
  mounted?: Mounted;
  delegated: Map<Node, Map<string, EventListener>>;
  portalTargets: Set<Node>;
  eventContainer?: Node;
  errors: ErrorContextValue;
  current: VNode;
  version: number;
  boundary: ComponentFunction<{}, { version: number }>;
  logger?: Logger;
  debugMarkers: boolean;
  maxTreeDepth: number;
  traversalDepth: number;
  maxTreeNodes: number;
  traversedNodes: number;
  workDepth: number;
  workBudget?: DomWorkBudget;
  allowUnsafeHtml: boolean;
  onUnsafeHtml?: (event: UnsafeHtmlAuditEvent) => void;
  /** Hydrated roots are anchored by SSR markers rather than the synthetic client root boundary. */
  mode?: "client" | "hydrated";
  /** Component ranges are inferred when the public server format omits eXact markers. */
  markerlessHydration?: boolean;
};

export type RenderOptions = {
  logger?: Logger;
  debugMarkers?: boolean;
  /** Observes errors that reach the renderer root without a component boundary. */
  onErrorReport?: (report: ErrorReport) => void;
  /** Maximum nested vnode depth accepted by mounting, patching, or hydration. */
  maxTreeDepth?: number;
  /** Maximum vnode and placeholder child values processed by one DOM update. */
  maxTreeNodes?: number;
  /** Allows unsafeHtml() ranges. The application accepts responsibility for their contents. */
  allowUnsafeHtml?: boolean;
  /** Receives an audit notification whenever an unsafe HTML range is mounted or changed. */
  onUnsafeHtml?: (event: UnsafeHtmlAuditEvent) => void;
  /** Internal shared budget used when hydration combines DOM scans and renderer work. */
  workBudget?: DomWorkBudget;
};
