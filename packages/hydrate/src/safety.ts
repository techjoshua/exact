export function isSafeObjectKey(key: string): boolean {
  return key !== "__proto__" && key !== "prototype" && key !== "constructor";
}
