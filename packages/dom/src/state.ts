import type { ComponentInstance, StopHandle } from '@exact/core';
import type { Mounted, Root } from './types.js';

export const roots = new WeakMap<Element, Root>();
export const eventHandlers = new WeakMap<Element, Map<string, EventListener>>();
export const directEventHandlers = new WeakMap<
	Element,
	Map<string, { type: string; listener: EventListener; capture: boolean }>
>();
export const elementOwners = new WeakMap<Element, ComponentInstance<any>>();
export const propBindings = new WeakMap<Element, Map<string, StopHandle>>();
export const componentMounts = new WeakMap<ComponentInstance<any>, Mounted>();
