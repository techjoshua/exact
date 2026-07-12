import type { ComponentInstance } from "@exact/core";
import { elementOwners } from "./state.js";

export function setElementOwner(element: Element, owner: ComponentInstance<any>): void {
  elementOwners.set(element, owner);
}

export function clearElementOwner(element: Element): void {
  elementOwners.delete(element);
}

export function findOwnerInstance(element: Element): ComponentInstance<any> | undefined {
  let cursor: Element | null = element;
  while (cursor) {
    const owner = elementOwners.get(cursor);
    if (owner) return owner;
    cursor = cursor.parentElement;
  }
  return undefined;
}
