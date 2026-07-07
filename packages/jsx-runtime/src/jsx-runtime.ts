import { createVNode, Fragment, type Child, type ComponentFunction, type RefBinding, type VNode } from "@exact/core";

export { Fragment };

type Props = Record<string, unknown> & {
  children?: Child | Child[];
  key?: string;
};

type JsxType = string | ComponentFunction<any, any> | typeof Fragment;

export function jsx<P extends Props>(type: ComponentFunction<any, P>, props: P | null, key?: string): VNode<P>;
export function jsx(type: string | typeof Fragment, props: Props | null, key?: string): VNode;
export function jsx(type: JsxType, props: Props | null, key?: string): VNode {
  return createJsxVNode(type, props, key);
}

export function jsxs<P extends Props>(type: ComponentFunction<any, P>, props: P | null, key?: string): VNode<P>;
export function jsxs(type: string | typeof Fragment, props: Props | null, key?: string): VNode;
export function jsxs(type: JsxType, props: Props | null, key?: string): VNode {
  return createJsxVNode(type, props, key);
}

export function jsxDEV(type: JsxType, props: Props | null, key?: string): VNode {
  return createJsxVNode(type, props, key);
}

function createJsxVNode(type: JsxType, props: Props | null, key?: string): VNode {
  const { children, ...rest } = props ?? {};
  const normalizedKey = key ?? (typeof rest.key === "string" ? rest.key : undefined);
  if ("key" in rest) delete rest.key;
  const childList = Array.isArray(children) ? children : children === undefined ? [] : [children];
  return createVNode(type, normalizedKey ? { ...rest, key: normalizedKey } : rest, ...childList);
}

export namespace JSX {
  export type Element = VNode;
  export type ElementType = string | typeof Fragment | ComponentFunction<any, any>;
  export type EventHandler<TEvent extends Event = Event> = (event: TEvent) => void;
  export type StyleValue = unknown;
  export type StyleObject = Record<string, StyleValue>;
  export interface IntrinsicAttributes {
    key?: string;
  }
  export interface ElementChildrenAttribute {
    children: {};
  }
  export interface IntrinsicElementProps {
    children?: Child | Child[];
    key?: string;
    ref?: RefBinding<unknown>;
    class?: unknown;
    className?: unknown;
    style?: string | StyleObject;
    disabled?: unknown;
    checked?: unknown;
    value?: unknown;
    [eventName: `on${string}`]: EventHandler | undefined;
    [attributeName: string]: unknown;
  }
  export interface IntrinsicElements {
    [elementName: string]: IntrinsicElementProps;
  }
}
