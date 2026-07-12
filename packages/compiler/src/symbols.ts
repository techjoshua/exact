import ts from "typescript";
import { stableId } from "./ids.js";
import { generatedComponentName } from "./names.js";
import type {
  ExactBoundaryIR,
  ExactComponentIR,
  ExactSymbolIR,
  ExportBinding
} from "./types.js";

/** Creates symbol records for exported source components. */
export function createRootSymbols(sourceFile: ts.SourceFile, components: ExactComponentIR[], exports: readonly ExportBinding[]): ExactSymbolIR[] {
  const componentByName = new Map(components.map(component => [component.name, component]));
  const symbols: ExactSymbolIR[] = [];
  for (const binding of exports) {
    const component = componentByName.get(binding.localName);
    if (!component) continue;
    symbols.push({
      id: stableId(sourceFile.fileName, "symbol", component.id, "root", binding.exportedName),
      componentId: component.id,
      exportName: binding.exportedName,
      localName: component.name,
      generatedName: component.name,
      debugName: component.name,
      kind: "component",
      role: "root",
      target: component.placement === "client" ? "client" : component.placement === "server" ? "server" : "both",
      placement: component.placement
    });
  }
  return symbols.sort((left, right) => left.id.localeCompare(right.id));
}

/** Creates generated server-part symbol records for exported split components. */
export function createServerPartSymbols(sourceFile: ts.SourceFile, components: ExactComponentIR[]): ExactSymbolIR[] {
  const symbols: ExactSymbolIR[] = [];
  for (const component of components) {
    if (!component.exported) continue;
    if (component.placement === "client") continue;
    if (component.clientIslandCount <= 0) continue;
    const generatedName = generatedComponentName(component.name, "server-part", 1);
    symbols.push({
      id: stableId(sourceFile.fileName, component.name, "server-part", "1"),
      componentId: component.id,
      exportName: generatedName,
      localName: component.name,
      generatedName,
      debugName: `${component.name}:server-part:1`,
      kind: "component",
      role: "server-part",
      target: "server",
      placement: component.placement
    });
  }
  return symbols;
}

/** Creates generated client-island symbol records for exported split components. */
export function createClientIslandSymbols(sourceFile: ts.SourceFile, components: ExactComponentIR[]): ExactSymbolIR[] {
  const symbols: ExactSymbolIR[] = [];
  for (const component of components) {
    if (!component.exported) continue;
    for (let index = 1; index <= component.clientIslandCount; index++) {
      const generatedName = generatedComponentName(component.name, "client-island", index);
      symbols.push({
        id: stableId(sourceFile.fileName, component.name, "client-island", String(index)),
        componentId: component.id,
        exportName: generatedName,
        localName: generatedName,
        generatedName,
        debugName: `${component.name}:client-island:${index}`,
        kind: "component",
        role: "client-island",
        target: "client",
        placement: "client"
      });
    }
  }
  return symbols;
}

/** Creates boundary records for generated client islands and client-root components. */
export function createClientIslandBoundaries(
  sourceFile: ts.SourceFile,
  components: ExactComponentIR[]
): ExactBoundaryIR[] {
  const boundaries: ExactBoundaryIR[] = [];
  const seen = new Set<string>();
  for (const component of components) {
    for (let index = 1; index <= component.clientIslandCount; index++) {
      const id = stableId(sourceFile.fileName, component.name, "client-island", String(index));
      seen.add(id);
      boundaries.push({
        id: stableId(sourceFile.fileName, component.name, "client-island", String(index)),
        name: generatedComponentName(component.name, "client-island", index),
        componentId: component.id,
        ownerComponentId: component.id,
        kind: "client-island"
      });
    }
    if (component.exported && component.placement === "client") {
      const id = stableId(sourceFile.fileName, component.name, "component-island");
      if (!seen.has(id)) {
        seen.add(id);
        boundaries.push({
          id,
          name: component.name,
          componentId: component.id,
          ownerComponentId: component.id,
          kind: "client-island"
        });
      }
    }
  }
  return boundaries;
}
