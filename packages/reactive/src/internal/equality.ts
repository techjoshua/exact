import { isPlainObject } from "./objects.js";

export type UnwrapValue = (value: unknown) => unknown;

/** Returns whether two values differ after reactive wrappers and plain structures are compared. */
export function hasChanged(previous: unknown, next: unknown, unwrap: UnwrapValue): boolean {
  return !structurallyEqual(previous, next, unwrap);
}

/** Compares primitives, arrays, and plain objects after unwrapping reactive values. */
export function structurallyEqual(left: unknown, right: unknown, unwrap: UnwrapValue): boolean {
  return structurallyEqualInner(left, right, unwrap, new WeakMap());
}

function structurallyEqualInner(
  left: unknown,
  right: unknown,
  unwrap: UnwrapValue,
  seen: WeakMap<object, WeakSet<object>>
): boolean {
  if (Object.is(left, right)) return true;

  const unwrappedLeft = unwrap(left);
  const unwrappedRight = unwrap(right);
  if (Object.is(unwrappedLeft, unwrappedRight)) return true;

  if (unwrappedLeft && unwrappedRight && typeof unwrappedLeft === "object" && typeof unwrappedRight === "object") {
    let paired = seen.get(unwrappedLeft);
    if (paired?.has(unwrappedRight)) return true;
    if (!paired) {
      paired = new WeakSet();
      seen.set(unwrappedLeft, paired);
    }
    paired.add(unwrappedRight);
  }

  if (Array.isArray(unwrappedLeft) && Array.isArray(unwrappedRight)) {
    if (unwrappedLeft.length !== unwrappedRight.length) return false;
    for (let index = 0; index < unwrappedLeft.length; index++) {
      if (!structurallyEqualInner(unwrappedLeft[index], unwrappedRight[index], unwrap, seen)) return false;
    }
    return true;
  }

  if (isPlainObject(unwrappedLeft) && isPlainObject(unwrappedRight)) {
    const leftKeys = Reflect.ownKeys(unwrappedLeft);
    const rightKeys = Reflect.ownKeys(unwrappedRight);
    if (leftKeys.length !== rightKeys.length) return false;

    for (const key of leftKeys) {
      if (!Reflect.has(unwrappedRight, key)) return false;
      if (!structurallyEqualInner(
        unwrappedLeft[key],
        unwrappedRight[key],
        unwrap,
        seen
      )) {
        return false;
      }
    }

    return true;
  }

  return false;
}
