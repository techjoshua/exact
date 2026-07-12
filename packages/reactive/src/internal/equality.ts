import { isPlainObject } from "./objects.js";

export type UnwrapValue = (value: unknown) => unknown;

export function hasChanged(previous: unknown, next: unknown, unwrap: UnwrapValue): boolean {
  return !structurallyEqual(previous, next, unwrap);
}

export function structurallyEqual(left: unknown, right: unknown, unwrap: UnwrapValue): boolean {
  if (Object.is(left, right)) return true;

  const unwrappedLeft = unwrap(left);
  const unwrappedRight = unwrap(right);
  if (Object.is(unwrappedLeft, unwrappedRight)) return true;

  if (Array.isArray(unwrappedLeft) && Array.isArray(unwrappedRight)) {
    if (unwrappedLeft.length !== unwrappedRight.length) return false;
    for (let index = 0; index < unwrappedLeft.length; index++) {
      if (!structurallyEqual(unwrappedLeft[index], unwrappedRight[index], unwrap)) return false;
    }
    return true;
  }

  if (isPlainObject(unwrappedLeft) && isPlainObject(unwrappedRight)) {
    const leftKeys = Reflect.ownKeys(unwrappedLeft);
    const rightKeys = Reflect.ownKeys(unwrappedRight);
    if (leftKeys.length !== rightKeys.length) return false;

    for (const key of leftKeys) {
      if (!Reflect.has(unwrappedRight, key)) return false;
      if (!structurallyEqual(
        unwrappedLeft[key],
        unwrappedRight[key],
        unwrap
      )) {
        return false;
      }
    }

    return true;
  }

  return false;
}
