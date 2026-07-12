export function stableId(...parts: string[]): string {
  const input = parts.join(":");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `x${(hash >>> 0).toString(36)}`;
}
