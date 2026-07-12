/** Returns whether an object key is safe to write while avoiding prototype pollution vectors. */
export function isSafeObjectKey(key: string): boolean {
  return key !== "__proto__" && key !== "prototype" && key !== "constructor";
}
