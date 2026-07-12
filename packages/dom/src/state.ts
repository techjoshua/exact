import type { ComponentInstance, StopHandle } from "@exact/core";
import type { Root } from "./types.js";

export const roots = new WeakMap<Element, Root>();
export const eventHandlers = new WeakMap<Element, Map<string, EventListener>>();
export const elementOwners = new WeakMap<Element, ComponentInstance<any>>();
export const propBindings = new WeakMap<Element, Map<string, StopHandle>>();
