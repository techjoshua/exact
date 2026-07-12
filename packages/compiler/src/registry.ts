import path from "node:path";
import { clientRegistryModulePath } from "./paths.js";
import type {
  ClientIslandRegistryEntry,
  ClientIslandRegistryOptions,
  ExactArtifactGraph,
  ExactArtifactGraphInput,
  ExactBoundaryIR,
  ExactHydrationRegistrationModuleOptions,
  ExactRegistryModuleOptions,
  ExactStateEffect,
  ExactSymbolIR,
  ServerPartRegistryEntry,
  ServerPartRegistryOptions
} from "./types.js";

/** Creates registry entries for client island components from compiled artifacts. */
export function createClientIslandRegistryEntries(
  results: readonly ExactArtifactGraphInput[],
  options: ClientIslandRegistryOptions = {}
): ClientIslandRegistryEntry[] {
  const entries: ClientIslandRegistryEntry[] = [];

  for (const result of results) {
    const modulePath = clientRegistryModulePath(result.clientFile, options.rootDir ?? path.dirname(result.manifestFile));
    for (const symbol of result.manifest.symbols) {
      if (!clientRegistrySymbol(symbol)) continue;
      entries.push({
        id: symbol.id,
        name: symbol.generatedName,
        exportName: symbol.exportName,
        module: modulePath,
        componentId: symbol.componentId
      });
    }
  }

  return entries.sort((left, right) => left.id.localeCompare(right.id));
}

/** Creates a JavaScript module exporting a client island registry object. */
export function createClientIslandRegistryModule(
  entries: readonly ClientIslandRegistryEntry[],
  options: ExactRegistryModuleOptions = {}
): string {
  return createNamedRegistryModule(entries, options.exportName ?? "exactClientIslands");
}

/** Creates registry entries for generated server component parts from compiled artifacts. */
export function createServerPartRegistryEntries(
  results: readonly ExactArtifactGraphInput[],
  options: ServerPartRegistryOptions = {}
): ServerPartRegistryEntry[] {
  const entries: ServerPartRegistryEntry[] = [];

  for (const result of results) {
    const modulePath = clientRegistryModulePath(result.serverFile, options.rootDir ?? path.dirname(result.manifestFile));
    for (const symbol of result.manifest.symbols) {
      if (symbol.role !== "server-part" || symbol.target !== "server" || !symbol.exportName) continue;
      entries.push({
        id: symbol.id,
        name: symbol.generatedName,
        exportName: symbol.exportName,
        module: modulePath,
        componentId: symbol.componentId
      });
    }
  }

  return entries.sort((left, right) => left.id.localeCompare(right.id));
}

/** Creates a JavaScript module exporting a server part registry object. */
export function createServerPartRegistryModule(
  entries: readonly ServerPartRegistryEntry[],
  options: ExactRegistryModuleOptions = {}
): string {
  return createNamedRegistryModule(entries, options.exportName ?? "exactServerParts");
}

/** Creates a hydration registration module for client islands, contracts, and action boundaries. */
export function createExactHydrationRegistrationModule(
  graph: ExactArtifactGraph,
  options: ExactHydrationRegistrationModuleOptions = {}
): string {
  const islandsExportName = options.islandsExportName ?? "exactClientIslands";
  const registrationExportName = options.registrationExportName ?? "exactHydrationRegistration";
  const islandsModule = createClientIslandRegistryModule(graph.clientIslands, {
    exportName: islandsExportName
  });
  const registration = omitUndefinedProperties({
    endpoint: options.endpoint,
    endpoints: options.endpoints,
    stateContracts: hydrationStateContractsFromGraph(graph),
    actionBoundaries: hydrationActionBoundariesFromGraph(graph)
  });
  const registrationEntries = [
    `  islands: ${islandsExportName}`,
    ...Object.entries(registration).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
  ];
  return `${islandsModule}\nexport const ${registrationExportName} = {\n${registrationEntries.join(",\n")}\n};\n`;
}

function clientRegistrySymbol(symbol: ExactSymbolIR): symbol is ExactSymbolIR & { exportName: string } {
  if (symbol.target !== "client" || !symbol.exportName) return false;
  return symbol.role === "client-island" || (symbol.role === "root" && symbol.placement === "client");
}

function createNamedRegistryModule(
  entries: readonly (ClientIslandRegistryEntry | ServerPartRegistryEntry)[],
  exportName: string
): string {
  const sorted = [...entries].sort((left, right) => left.name.localeCompare(right.name) || left.module.localeCompare(right.module));
  const seen = new Set<string>();
  const imports: string[] = [];
  const properties: string[] = [];
  sorted.forEach((entry, index) => {
    if (seen.has(entry.name)) {
      throw new Error(`Duplicate eXact registry entry ${entry.name}`);
    }
    seen.add(entry.name);
    const local = `__exactRegistry${index}`;
    imports.push(`import { ${entry.exportName} as ${local} } from ${JSON.stringify(entry.module)};`);
    properties.push(`  ${JSON.stringify(entry.name)}: ${local}`);
  });
  return `${imports.join("\n")}\n\nexport const ${exportName} = {\n${properties.join(",\n")}\n};\n`;
}

function hydrationStateContractsFromGraph(graph: ExactArtifactGraph): Record<string, { reads: ExactStateEffect[]; writes: ExactStateEffect[] }> {
  const entries: [string, { reads: ExactStateEffect[]; writes: ExactStateEffect[] }][] = [];
  for (const entry of graph.artifacts) {
    for (const [id, action] of Object.entries(entry.manifest.serverActions)) {
      entries.push([id, action.stateContract]);
    }
  }
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}

function hydrationActionBoundariesFromGraph(graph: ExactArtifactGraph): Record<string, string[]> {
  const boundaries = new Map<string, ExactBoundaryIR>();
  const componentBoundaries = new Map<string, string>();
  for (const entry of graph.artifacts) {
    for (const boundary of entry.manifest.boundaries) {
      boundaries.set(boundary.id, boundary);
    }
    for (const component of entry.manifest.components) {
      if (component.placement === "client") continue;
      componentBoundaries.set(component.id, component.id);
    }
  }

  const output: Record<string, string[]> = {};
  const actions = graph.artifacts
    .flatMap(entry => Object.values(entry.manifest.serverActions))
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const action of actions) {
    // Actions refresh all boundaries owned by the action's component, including
    // the component root fallback boundary for server-renderable components.
    const ids = [
      ...[...boundaries.values()]
        .filter(boundary => (boundary.ownerComponentId ?? boundary.componentId) === action.componentId)
        .map(boundary => boundary.id),
      ...[...componentBoundaries.entries()]
        .filter(([componentId]) => componentId === action.componentId)
        .map(([, boundaryId]) => boundaryId)
    ].sort();
    if (ids.length) output[action.id] = [...new Set(ids)];
  }
  return output;
}

function omitUndefinedProperties(value: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item;
  }
  return output;
}
