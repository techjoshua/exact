import type {
  ComponentFunction,
  ComponentInstance,
  ErrorContextValue,
  Logger,
  StopHandle,
  VNode
} from "@exact/core";
import type { EffectScope } from "@exact/reactive";

export type Mounted = {
  vnode: VNode;
  dom: Node;
  /** Optional closing boundary marker when this subtree was adopted from SSR. */
  end?: Node;
  /** Marker range that wraps an ordinary keyed list item vnode. */
  range?: "item";
  scope: EffectScope;
  children: Mounted[];
  instance?: ComponentInstance<any>;
  delegatedEvents?: Map<string, EventListener>;
  stop?: StopHandle;
};

export type Root = {
  container: Element;
  mounted?: Mounted;
  delegated: Map<string, EventListener>;
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
  /** Hydrated roots are anchored by SSR markers rather than the synthetic client root boundary. */
  mode?: "client" | "hydrated";
};

export type RenderOptions = {
  logger?: Logger;
  debugMarkers?: boolean;
  /** Maximum nested vnode depth accepted by mounting, patching, or hydration. */
  maxTreeDepth?: number;
  /** Maximum vnode and placeholder child values processed by one DOM update. */
  maxTreeNodes?: number;
};
