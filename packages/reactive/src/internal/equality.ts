import { isPlainObject } from "./objects.js";

export type UnwrapValue = (value: unknown) => unknown;

/** Returns whether two values differ after reactive wrappers and plain structures are compared. */
export function hasChanged(previous: unknown, next: unknown, unwrap: UnwrapValue): boolean {
  return !structurallyEqual(previous, next, unwrap);
}

/** Compares primitives, arrays, and plain objects after unwrapping reactive values. */
export function structurallyEqual(left: unknown, right: unknown, unwrap: UnwrapValue): boolean {
  return structurallyEqualInner(left, right, unwrap, new WeakMap(), new WeakMap());
}

function structurallyEqualInner(
  left: unknown,
  right: unknown,
  unwrap: UnwrapValue,
  leftToRight: WeakMap<object, object>,
  rightToLeft: WeakMap<object, object>
): boolean {
  if (Object.is(left, right)) return true;

  const unwrappedLeft = unwrap(left);
  const unwrappedRight = unwrap(right);
  if (Object.is(unwrappedLeft, unwrappedRight)) return true;

  if (unwrappedLeft && unwrappedRight && typeof unwrappedLeft === "object" && typeof unwrappedRight === "object") {
    const priorRight = leftToRight.get(unwrappedLeft);
    const priorLeft = rightToLeft.get(unwrappedRight);
    if (priorRight || priorLeft) return priorRight === unwrappedRight && priorLeft === unwrappedLeft;
    leftToRight.set(unwrappedLeft, unwrappedRight);
    rightToLeft.set(unwrappedRight, unwrappedLeft);
  }

  if (Array.isArray(unwrappedLeft) && Array.isArray(unwrappedRight)) {
    if (unwrappedLeft.length !== unwrappedRight.length) return false;
    if (Object.getPrototypeOf(unwrappedLeft) !== Object.getPrototypeOf(unwrappedRight)) return false;
    const leftKeys = Reflect.ownKeys(unwrappedLeft).filter(key => key !== "length");
    const rightKeys = Reflect.ownKeys(unwrappedRight).filter(key => key !== "length");
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(unwrappedRight, key)) return false;
      if (!equalOwnDataProperty(unwrappedLeft, unwrappedRight, key, unwrap, leftToRight, rightToLeft)) return false;
    }
    return true;
  }

  if (isPlainObject(unwrappedLeft) && isPlainObject(unwrappedRight)) {
    if (Object.getPrototypeOf(unwrappedLeft) !== Object.getPrototypeOf(unwrappedRight)) return false;
    const leftKeys = Reflect.ownKeys(unwrappedLeft);
    const rightKeys = Reflect.ownKeys(unwrappedRight);
    if (leftKeys.length !== rightKeys.length) return false;

    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(unwrappedRight, key)) return false;
      if (!equalOwnDataProperty(unwrappedLeft, unwrappedRight, key, unwrap, leftToRight, rightToLeft)) return false;
    }

    return true;
  }

  return false;
}

function equalOwnDataProperty(
  left: object,
  right: object,
  key: PropertyKey,
  unwrap: UnwrapValue,
  leftToRight: WeakMap<object, object>,
  rightToLeft: WeakMap<object, object>
): boolean {
  const leftDescriptor = Reflect.getOwnPropertyDescriptor(left, key);
  const rightDescriptor = Reflect.getOwnPropertyDescriptor(right, key);
  if (!leftDescriptor || !rightDescriptor) return false;
  // Structural comparison is intentionally side-effect free. Accessors are
  // opaque values: only the exact same accessor descriptor is equal.
  if (!("value" in leftDescriptor) || !("value" in rightDescriptor)) {
    return leftDescriptor.get === rightDescriptor.get
      && leftDescriptor.set === rightDescriptor.set
      && leftDescriptor.enumerable === rightDescriptor.enumerable
      && leftDescriptor.configurable === rightDescriptor.configurable;
  }
  if (leftDescriptor.enumerable !== rightDescriptor.enumerable
    || leftDescriptor.configurable !== rightDescriptor.configurable
    || leftDescriptor.writable !== rightDescriptor.writable) return false;
  return structurallyEqualInner(leftDescriptor.value, rightDescriptor.value, unwrap, leftToRight, rightToLeft);
}
