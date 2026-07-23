import type { ComponentInstance, StopHandle } from '@exactjs/core';
import type { Mounted, Root } from './types.js';

/** Provides the canonical roots value. */
export const roots = new WeakMap<Element, Root>();
/** Provides the canonical event handlers value. */
export const eventHandlers = new WeakMap<Element, Map<string, EventListener>>();
/** Provides the canonical direct event handlers value. */
export const directEventHandlers = new WeakMap<
	Element,
	Map<string, { type: string; listener: EventListener; capture: boolean }>
>();
/** Provides the canonical element owners value. */
export const elementOwners = new WeakMap<Element, ComponentInstance<any>>();
/** Provides ownership for framework marker and text nodes. */
export const nodeOwners = new WeakMap<Node, ComponentInstance<any>>();
/** Provides the canonical prop bindings value. */
export const propBindings = new WeakMap<Element, Map<string, StopHandle>>();
/** Provides the canonical component mounts value. */
export const componentMounts = new WeakMap<ComponentInstance<any>, Mounted>();
