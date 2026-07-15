import { stableId } from "./ids.js";
import { generatedComponentName } from "./names.js";
import type {
  ExactBoundaryIR,
  ExactCallableSummaryIR,
  ExactComponentIR,
  ExactSymbolIR,
  ExportBinding
} from "./types.js";

type SourceIdentity = string | Readonly<{ fileName: string }>;

function sourceFilename(source: SourceIdentity): string {
  return typeof source === "string" ? source : source.fileName;
}

/** Creates symbol records for exported non-component declarations with proven artifact targets. */
export function createValueRootSymbols(source: SourceIdentity, callables: readonly ExactCallableSummaryIR[]): ExactSymbolIR[] {
  const filename = sourceFilename(source);
  const symbols: ExactSymbolIR[] = [];
  for (const callable of callables) for (const exportName of callable.exportNames) {
    if (!callable.artifactTargets.length) continue;
    const placement = callable.effect === "browser" || callable.artifactTargets.length === 1 && callable.artifactTargets[0] === "client" ? "client"
      : callable.effect === "server" || callable.artifactTargets.length === 1 && callable.artifactTargets[0] === "server" ? "server"
        : callable.effect === "neutral" ? "isomorphic" : "unknown";
    const localName = callable.kind === "initializer" ? callable.name.replace(/\.initializer$/, "") : callable.name;
    symbols.push({
      id: stableId(filename, "symbol", callable.id, "root", exportName),
      exportName,
      localName,
      generatedName: localName,
      debugName: localName,
      kind: "value",
      role: "root",
      target: callable.artifactTargets.length === 1 ? callable.artifactTargets[0]! : "both",
      placement
    });
  }
  return symbols.sort((left, right) => left.id.localeCompare(right.id));
}

/** Creates symbol records for exported source components. */
export function createRootSymbols(source: SourceIdentity, components: ExactComponentIR[], exports: readonly ExportBinding[]): ExactSymbolIR[] {
  const filename = sourceFilename(source);
  const componentByName = new Map(components.map(component => [component.name, component]));
  const symbols: ExactSymbolIR[] = [];
  for (const binding of exports) {
    const component = componentByName.get(binding.localName);
    if (!component) continue;
    symbols.push({
      id: stableId(filename, "symbol", component.id, "root", binding.exportedName),
      componentId: component.id,
      exportName: binding.exportedName,
      localName: component.name,
      generatedName: component.name,
      debugName: component.name,
      kind: "component",
      role: "root",
      target: component.artifactTargets?.length === 1 ? component.artifactTargets[0]! : "both",
      placement: component.placement
    });
  }
  return symbols.sort((left, right) => left.id.localeCompare(right.id));
}

/** Creates generated server-part symbol records for exported split components. */
export function createServerPartSymbols(source: SourceIdentity, components: ExactComponentIR[]): ExactSymbolIR[] {
  const filename = sourceFilename(source);
  const symbols: ExactSymbolIR[] = [];
  for (const component of components) {
    if (!component.exported) continue;
    if (component.placement === "client") continue;
    if (component.clientIslandCount <= 0) continue;
    const generatedName = generatedComponentName(component.name, "server-part", 1);
    symbols.push({
      id: stableId(filename, component.name, "server-part", "1"),
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
export function createClientIslandSymbols(source: SourceIdentity, components: ExactComponentIR[]): ExactSymbolIR[] {
  const filename = sourceFilename(source);
  const symbols: ExactSymbolIR[] = [];
  for (const component of components) {
    if (!component.exported) continue;
    for (let index = 1; index <= component.clientIslandCount; index++) {
      const generatedName = generatedComponentName(component.name, "client-island", index);
      symbols.push({
        id: stableId(filename, component.name, "client-island", String(index)),
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
  source: SourceIdentity,
  components: ExactComponentIR[]
): ExactBoundaryIR[] {
  const filename = sourceFilename(source);
  const boundaries: ExactBoundaryIR[] = [];
  const seen = new Set<string>();
  for (const component of components) {
    for (let index = 1; index <= component.clientIslandCount; index++) {
      const id = stableId(filename, component.name, "client-island", String(index));
      seen.add(id);
      boundaries.push({
        id: stableId(filename, component.name, "client-island", String(index)),
        name: generatedComponentName(component.name, "client-island", index),
        componentId: component.id,
        ownerComponentId: component.id,
        kind: "client-island"
      });
    }
    if (component.exported && component.placement === "client") {
      const id = stableId(filename, component.name, "component-island");
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
