import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { isExactArtifactManifest, parseExactCompilerManifest } from "./manifest-parse.js";
import {
  packageExportSpecifier,
  packageExportTarget,
  sortPlanEntries
} from "./paths.js";
import {
  createClientIslandRegistryEntries,
  createClientIslandRegistryModule,
  createServerPartRegistryEntries,
  createServerPartRegistryModule
} from "./registry.js";
import type {
  CompileArtifactsResult,
  ExactArtifactComponentEdge,
  ExactArtifactGraph,
  ExactArtifactGraphEntry,
  ExactArtifactGraphInput,
  ExactArtifactGraphOptions,
  ExactArtifactImportResolution,
  ExactArtifactPlan,
  ExactArtifactPlanDiff,
  ExactArtifactPlanDiffOptions,
  ExactArtifactPlanEntry,
  ExactArtifactRegistryModules,
  ExactArtifactRegistryModulesOptions,
  ExactArtifactTarget,
  ExactExportConditionOptions,
  PackageExportEntry,
  PackageExportMapOptions
} from "./types.js";

export function artifactGraphEntryFromCompileResult(result: CompileArtifactsResult): ExactArtifactGraphEntry {
  return {
    inputFile: result.inputFile,
    clientFile: result.clientFile,
    serverFile: result.serverFile,
    manifestFile: result.manifestFile,
    manifest: result.manifest
  };
}

export function diffExactArtifactPlans(
  previous: ExactArtifactPlan,
  next: ExactArtifactPlan,
  options: ExactArtifactPlanDiffOptions = {}
): ExactArtifactPlanDiff {
  const previousByInput = new Map(previous.entries.map(entry => [path.resolve(entry.inputFile), entry]));
  const nextByInput = new Map(next.entries.map(entry => [path.resolve(entry.inputFile), entry]));
  const changedInputs = new Set((options.changedInputs ?? []).map(file => path.resolve(file)));
  const added: ExactArtifactPlanEntry[] = [];
  const removed: ExactArtifactPlanEntry[] = [];
  const changed: ExactArtifactPlanEntry[] = [];
  const retained: ExactArtifactPlanEntry[] = [];

  for (const [inputFile, entry] of nextByInput) {
    if (!previousByInput.has(inputFile)) {
      added.push(entry);
    } else if (changedInputs.has(inputFile)) {
      changed.push(entry);
    } else {
      retained.push(entry);
    }
  }
  for (const [inputFile, entry] of previousByInput) {
    if (!nextByInput.has(inputFile)) removed.push(entry);
  }

  return {
    added: sortPlanEntries(added),
    removed: sortPlanEntries(removed),
    changed: sortPlanEntries(changed),
    retained: sortPlanEntries(retained)
  };
}

export function createPackageExportMap(
  results: readonly ExactArtifactGraphInput[],
  options: PackageExportMapOptions
): Record<string, PackageExportEntry> {
  const clientCondition = options.clientCondition ?? "exact-client";
  const serverCondition = options.serverCondition ?? "exact-server";
  const output: Record<string, PackageExportEntry> = {};

  for (const result of results) {
    const specifier = packageExportSpecifier(result.inputFile, options.sourceRoot ?? options.packageRoot);
    const client = packageExportTarget(result.clientFile, options.packageRoot);
    const server = packageExportTarget(result.serverFile, options.packageRoot);
    output[specifier] = {
      [clientCondition]: client,
      [serverCondition]: server,
      default: options.defaultTarget === "server" ? server : client
    };
  }

  return output;
}

export function exactExportConditions(
  target: ExactArtifactTarget,
  options: ExactExportConditionOptions = {}
): string[] {
  return [target === "server" ? options.serverCondition ?? "exact-server" : options.clientCondition ?? "exact-client"];
}

export function resolveExactArtifactImport(
  source: string,
  importer: string | undefined,
  target: ExactArtifactTarget
): ExactArtifactImportResolution | null {
  if (!source.endsWith(".exact")) return null;
  const base = `${source}.${target}`;
  const resolved = resolveArtifactCandidate(base, importer);
  return {
    id: resolved,
    target
  };
}

function resolveArtifactCandidate(base: string, importer: string | undefined): string {
  const candidateBase = !importer || path.isAbsolute(base) ? base : path.resolve(path.dirname(importer), base);
  for (const extension of artifactExtensionPreference(importer)) {
    const candidate = `${candidateBase}${extension}`;
    if (existsSync(candidate)) return candidate;
  }
  return `${candidateBase}${artifactExtensionPreference(importer)[0]}`;
}

function artifactExtensionPreference(importer: string | undefined): [".ts", ".js"] | [".js", ".ts"] {
  const extension = importer ? path.extname(importer).toLowerCase() : "";
  return extension === ".js" || extension === ".jsx"
    ? [".js", ".ts"]
    : [".ts", ".js"];
}

export function createExactArtifactGraph(
  results: readonly ExactArtifactGraphInput[],
  options: ExactArtifactGraphOptions
): ExactArtifactGraph {
  return {
    conditions: {
      client: exactExportConditions("client", options),
      server: exactExportConditions("server", options)
    },
    packageExports: createPackageExportMap(results, options),
    componentEdges: createExactArtifactComponentEdges(results),
    clientIslands: createClientIslandRegistryEntries(results, {
      rootDir: options.rootDir ?? options.packageRoot
    }),
    serverParts: createServerPartRegistryEntries(results, {
      rootDir: options.rootDir ?? options.packageRoot
    }),
    artifacts: results.map(result => ({
      inputFile: result.inputFile,
      clientFile: result.clientFile,
      serverFile: result.serverFile,
      manifestFile: result.manifestFile,
      manifest: result.manifest
    }))
  };
}

export function createExactArtifactComponentEdges(results: readonly ExactArtifactGraphInput[]): ExactArtifactComponentEdge[] {
  const edges: ExactArtifactComponentEdge[] = [];
  for (const result of results) {
    for (const component of result.manifest.components) {
      for (const edge of component.renderEdges) {
        edges.push({
          id: edge.id,
          sourceFile: result.inputFile,
          sourceComponentId: component.id,
          sourceName: component.name,
          targetComponentId: edge.componentId,
          targetName: edge.name,
          tag: edge.tag,
          placement: edge.placement,
          boundary: edge.boundary,
          index: edge.index,
          path: edge.path
        });
      }
    }
  }
  return edges.sort((left, right) => [
    left.sourceFile,
    left.sourceName,
    String(left.index).padStart(6, "0"),
    left.tag,
    left.targetName
  ].join(":").localeCompare([
    right.sourceFile,
    right.sourceName,
    String(right.index).padStart(6, "0"),
    right.tag,
    right.targetName
  ].join(":")));
}

export function createExactArtifactRegistryModules(
  graph: ExactArtifactGraph,
  options: ExactArtifactRegistryModulesOptions = {}
): ExactArtifactRegistryModules {
  return {
    client: createClientIslandRegistryModule(graph.clientIslands, {
      exportName: options.clientExportName
    }),
    server: createServerPartRegistryModule(graph.serverParts, {
      exportName: options.serverExportName
    })
  };
}

export async function readExactArtifactManifestEntries(manifestFiles: readonly string[]): Promise<ExactArtifactGraphEntry[]> {
  const entries: ExactArtifactGraphEntry[] = [];
  for (const manifestFile of manifestFiles) {
    const manifest = parseExactCompilerManifest(JSON.parse(await readFile(manifestFile, "utf8")), manifestFile, "artifact");
    if (!manifest.artifacts) {
      throw new Error(`eXact artifact manifest ${manifestFile} is missing artifact metadata`);
    }
    if (!isExactArtifactManifest(manifest.artifacts)) {
      throw new Error(`eXact artifact manifest ${manifestFile} has malformed artifact metadata`);
    }
    const root = path.dirname(manifestFile);
    entries.push({
      inputFile: path.resolve(root, manifest.artifacts.source),
      clientFile: path.resolve(root, manifest.artifacts.client),
      serverFile: path.resolve(root, manifest.artifacts.server),
      manifestFile,
      manifest
    });
  }
  return entries.sort((left, right) => left.manifestFile.localeCompare(right.manifestFile));
}
