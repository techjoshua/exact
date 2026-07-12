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
};

export type RenderOptions = {
  logger?: Logger;
  debugMarkers?: boolean;
};
