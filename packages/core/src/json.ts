/** Options for bounded comparisons of manifest and hydration JSON data. */
export interface JsonComparisonOptions {
  readonly maxComparisons?: number;
}

/**
 * Compares JSON data structurally without serialization, property-order
 * sensitivity, recursion, getter execution, or unbounded work.
 *
 * Invalid JSON values, sparse arrays, accessors, cycles, and values exceeding
 * the comparison budget fail closed.
 */
export function sameJsonData(left: unknown, right: unknown, options: JsonComparisonOptions = {}): boolean {
  type Comparison = { readonly kind: "compare" | "complete"; readonly left: unknown; readonly right: unknown };
  const maxComparisons = options.maxComparisons ?? 100_000;
  if (!Number.isSafeInteger(maxComparisons) || maxComparisons < 1) return false;
  const pending: Comparison[] = [{ kind: "compare", left, right }];
  const activeLeft = new WeakSet<object>();
  const activeRight = new WeakSet<object>();
  const completedLeft = new WeakMap<object, WeakSet<object>>();
  let compared = 0;

  while (pending.length) {
    const comparison = pending.pop()!;
    const currentLeft = comparison.left;
    const currentRight = comparison.right;
    if (comparison.kind === "complete") {
      activeLeft.delete(currentLeft as object);
      activeRight.delete(currentRight as object);
      const matches = completedLeft.get(currentLeft as object) ?? new WeakSet<object>();
      matches.add(currentRight as object);
      completedLeft.set(currentLeft as object, matches);
      continue;
    }
    if (++compared > maxComparisons) return false;

    if (!isJsonObject(currentLeft) || !isJsonObject(currentRight)) {
      if (!isJsonScalar(currentLeft) || !isJsonScalar(currentRight) || !Object.is(currentLeft, currentRight)) return false;
      continue;
    }
    if (Array.isArray(currentLeft) !== Array.isArray(currentRight)) return false;
    if (completedLeft.get(currentLeft)?.has(currentRight)) continue;
    if (activeLeft.has(currentLeft) || activeRight.has(currentRight)) return false;
    activeLeft.add(currentLeft);
    activeRight.add(currentRight);
    pending.push({ kind: "complete", left: currentLeft, right: currentRight });

    if (Array.isArray(currentLeft)) {
      const rightArray = currentRight as unknown[];
      if (currentLeft.length !== rightArray.length) return false;
      if (Object.getOwnPropertySymbols(currentLeft).some(symbol => Object.prototype.propertyIsEnumerable.call(currentLeft, symbol))
        || Object.getOwnPropertySymbols(rightArray).some(symbol => Object.prototype.propertyIsEnumerable.call(rightArray, symbol))) return false;
      if (Object.keys(currentLeft).some(key => !isArrayIndexKey(key, currentLeft.length))
        || Object.keys(rightArray).some(key => !isArrayIndexKey(key, rightArray.length))) return false;
      for (let index = currentLeft.length - 1; index >= 0; index--) {
        const leftDescriptor = Object.getOwnPropertyDescriptor(currentLeft, index);
        const rightDescriptor = Object.getOwnPropertyDescriptor(rightArray, index);
        if (!leftDescriptor || !rightDescriptor || !("value" in leftDescriptor) || !("value" in rightDescriptor)) return false;
        pending.push({ kind: "compare", left: leftDescriptor.value, right: rightDescriptor.value });
      }
      continue;
    }

    if (!isPlainJsonObject(currentLeft) || !isPlainJsonObject(currentRight)) return false;
    const leftDescriptors = Object.getOwnPropertyDescriptors(currentLeft);
    const rightDescriptors = Object.getOwnPropertyDescriptors(currentRight);
    if (Object.getOwnPropertySymbols(currentLeft).some(symbol => Object.prototype.propertyIsEnumerable.call(currentLeft, symbol))
      || Object.getOwnPropertySymbols(currentRight).some(symbol => Object.prototype.propertyIsEnumerable.call(currentRight, symbol))) return false;
    const leftKeys = Object.keys(leftDescriptors).filter(key => leftDescriptors[key]!.enumerable).sort();
    const rightKeys = Object.keys(rightDescriptors).filter(key => rightDescriptors[key]!.enumerable).sort();
    if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
    for (let index = leftKeys.length - 1; index >= 0; index--) {
      const key = leftKeys[index]!;
      const leftDescriptor = leftDescriptors[key]!;
      const rightDescriptor = rightDescriptors[key]!;
      if (!("value" in leftDescriptor) || !("value" in rightDescriptor)) return false;
      pending.push({ kind: "compare", left: leftDescriptor.value, right: rightDescriptor.value });
    }
  }
  return true;
}

function isJsonObject(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

function isJsonScalar(value: unknown): value is null | boolean | number | string {
  return value === null || typeof value === "boolean" || typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value));
}

function isPlainJsonObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isArrayIndexKey(key: string, length: number): boolean {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}
