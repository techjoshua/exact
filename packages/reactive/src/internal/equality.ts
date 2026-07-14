import { isPlainObject } from "./objects.js";

export type UnwrapValue = (value: unknown) => unknown;

/** Returns whether two values differ after reactive wrappers and plain structures are compared. */
export function hasChanged(previous: unknown, next: unknown, unwrap: UnwrapValue): boolean {
  return !structurallyEqual(previous, next, unwrap);
}

/** Compares primitives, arrays, and plain objects after unwrapping reactive values. */
export function structurallyEqual(left: unknown, right: unknown, unwrap: UnwrapValue): boolean {
  const leftToRight = new WeakMap<object, object>();
  const rightToLeft = new WeakMap<object, object>();
  const pending: Array<readonly [unknown, unknown]> = [[left, right]];
  let visited = 0;
  while (pending.length) {
    if (++visited > 1_000_000) return false;
    const [rawLeft, rawRight] = pending.pop()!;
    if (Object.is(rawLeft, rawRight)) continue;
    const currentLeft = unwrap(rawLeft);
    const currentRight = unwrap(rawRight);
    if (Object.is(currentLeft, currentRight)) continue;
    if (!currentLeft || !currentRight || typeof currentLeft !== "object" || typeof currentRight !== "object") return false;
    const priorRight = leftToRight.get(currentLeft);
    const priorLeft = rightToLeft.get(currentRight);
    if (priorRight || priorLeft) {
      if (priorRight !== currentRight || priorLeft !== currentLeft) return false;
      continue;
    }
    leftToRight.set(currentLeft, currentRight);
    rightToLeft.set(currentRight, currentLeft);
    const arrays = Array.isArray(currentLeft) && Array.isArray(currentRight);
    const objects = isPlainObject(currentLeft) && isPlainObject(currentRight);
    if (!arrays && !objects) return false;
    if (Object.getPrototypeOf(currentLeft) !== Object.getPrototypeOf(currentRight)) return false;
    if (arrays && currentLeft.length !== (currentRight as unknown[]).length) return false;
    const leftKeys = Reflect.ownKeys(currentLeft).filter(key => !arrays || key !== "length");
    const rightKeys = Reflect.ownKeys(currentRight).filter(key => !arrays || key !== "length");
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(currentRight, key)) return false;
      const leftDescriptor = Reflect.getOwnPropertyDescriptor(currentLeft, key);
      const rightDescriptor = Reflect.getOwnPropertyDescriptor(currentRight, key);
      if (!leftDescriptor || !rightDescriptor) return false;
      if (!("value" in leftDescriptor) || !("value" in rightDescriptor)) {
        if (leftDescriptor.get !== rightDescriptor.get || leftDescriptor.set !== rightDescriptor.set
          || leftDescriptor.enumerable !== rightDescriptor.enumerable || leftDescriptor.configurable !== rightDescriptor.configurable) return false;
        continue;
      }
      if (leftDescriptor.enumerable !== rightDescriptor.enumerable || leftDescriptor.configurable !== rightDescriptor.configurable
        || leftDescriptor.writable !== rightDescriptor.writable) return false;
      pending.push([leftDescriptor.value, rightDescriptor.value]);
    }
  }
  return true;
}
