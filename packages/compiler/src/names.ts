import ts from "typescript";
import { stableId } from "./ids.js";

/** Generates a stable readable name for a compiler-created logical component. */
export function generatedComponentName(authorName: string, role: "server-part" | "client-island", index: number): string {
  const base = sanitizeIdentifier(authorName || "Component");
  const suffix = role === "server-part" ? "ExactServer" : "ExactClient";
  return `${base}_${suffix}_${index}`;
}

function sanitizeIdentifier(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_$]/g, "_");
  if (/^[A-Za-z_$]/.test(cleaned)) return cleaned;
  return `_${cleaned}`;
}

/** Returns the synthetic server-slot boundary id for a client boundary's children. */
export function serverSlotBoundaryId(boundaryId: string): string {
  return `${boundaryId}:children`;
}

/** Creates a deterministic boundary id for a client component tag in source. */
export function clientComponentBoundaryId(sourceFile: ts.SourceFile, componentName: string, node: ts.Node): string {
  return stableId(sourceFile.fileName, componentName, "component-island", String(node.getStart(sourceFile)), String(node.getEnd()));
}
