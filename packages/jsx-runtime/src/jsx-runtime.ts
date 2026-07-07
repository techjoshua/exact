import { createVNode, Fragment, type Child, type ComponentFunction, type VNode } from "@exact/core";

export { Fragment };

type Props = Record<string, unknown> & {
  children?: Child | Child[];
  key?: string;
};

export function jsx(type: string | ComponentFunction<any, any> | typeof Fragment, props: Props | null, key?: string): VNode {
  return createJsxVNode(type, props, key);
}

export function jsxs(type: string | ComponentFunction<any, any> | typeof Fragment, props: Props | null, key?: string): VNode {
  return createJsxVNode(type, props, key);
}

function createJsxVNode(type: string | ComponentFunction<any, any> | typeof Fragment, props: Props | null, key?: string): VNode {
  const { children, ...rest } = props ?? {};
  const normalizedKey = key ?? (typeof rest.key === "string" ? rest.key : undefined);
  if ("key" in rest) delete rest.key;
  const childList = Array.isArray(children) ? children : children === undefined ? [] : [children];
  return createVNode(type, normalizedKey ? { ...rest, key: normalizedKey } : rest, ...childList);
}

export namespace JSX {
  export type Element = VNode;
  export type ElementType = string | ComponentFunction<any, any>;
  export interface ElementChildrenAttribute {
    children: {};
  }
  export interface IntrinsicElements {
    [elementName: string]: Record<string, unknown>;
  }
}
