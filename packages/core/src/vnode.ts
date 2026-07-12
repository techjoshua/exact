import { computed, unwrap } from "@exact/reactive";
import { Cell, Dynamic, Fragment, ServerBoundary, ServerSlot, Text } from "./symbols.js";
import type { Child, RenderResult, VNode, VNodeCell, VNodeType } from "./index.js";

export function createVNode(type: VNodeType, props: Record<string, unknown> | null, ...children: unknown[]): VNode {
  const normalizedProps = { ...(props ?? {}) };
  const rawKey = unwrap(normalizedProps.key);
  const key = rawKey === null || rawKey === undefined ? undefined : String(rawKey);
  delete normalizedProps.key;

  return {
    type,
    props: normalizedProps,
    children: normalizeChildren(children),
    key
  };
}

export function createTextVNode(value: unknown): VNode {
  return {
    type: Text,
    props: { value },
    children: []
  };
}

export function createCellVNode(vnode: VNode): VNode<{ cell: VNodeCell }> {
  return {
    type: Cell,
    props: {
      cell: {
        id: Symbol("exact.cell"),
        vnode
      }
    },
    children: [],
    key: vnode.key
  };
}

export function createCompiledVNode(type: VNodeType, props: Record<string, unknown> | null, ...children: unknown[]): VNode {
  return createCellVNode(createVNode(type, props, ...children));
}

export function createCompiledFragment(props: Record<string, unknown> | null, ...children: unknown[]): VNode {
  return createCompiledVNode(Fragment, props, ...children);
}

export function createExpression<T>(compute: () => T) {
  return computed(compute);
}

export function createDynamicChild(compute: () => RenderResult): VNode {
  return createVNode(Dynamic, { value: computed(compute) });
}

export function createServerBoundary(id: string, name: string, props: Record<string, unknown> = {}, ...children: unknown[]): VNode {
  return createVNode(ServerBoundary, {
    id,
    name,
    props
  }, ...children);
}

export function createServerSlot(id: string): VNode {
  return createVNode(ServerSlot, { id });
}

export function normalizeChildren(children: unknown[]): Child[] {
  const normalized: Child[] = [];

  for (const child of children) {
    if (Array.isArray(child)) {
      normalized.push(...normalizeChildren(child));
    } else {
      normalized.push(child as Child);
    }
  }

  return normalized;
}

export function isVNode(value: unknown): value is VNode {
  return !!value && typeof value === "object" && "type" in value && "props" in value && "children" in value;
}

export function isCellVNode(value: unknown): value is VNode<{ cell: VNodeCell }> {
  return isVNode(value) && value.type === Cell;
}

export function getCellVNode(vnode: VNode<{ cell: VNodeCell }>): VNode {
  return vnode.props.cell.vnode;
}
