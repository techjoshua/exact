import { createHash } from "node:crypto";

export function stableId(...parts: string[]): string {
  const input = parts.join(":");
  return `x${createHash("sha256").update(input).digest("base64url").slice(0, 22)}`;
}
