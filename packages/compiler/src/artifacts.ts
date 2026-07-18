import { readdir, readFile, stat } from "node:fs/promises";
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
  ExactDiscoveredPackageManifest,
  ExactExportConditionOptions,
  PackageExportEntry,
  PackageExportMapOptions
} from "./types.js";

type ExactPackageJson = {
  name?: string;
  exact?: {
    manifests?: unknown;
  };
};

/** Converts a compile result into the graph entry shape used by artifact tooling. */
export function artifactGraphEntryFromCompileResult(result: CompileArtifactsResult): ExactArtifactGraphEntry {
  return {
    inputFile: result.inputFile,
    clientFile: result.clientFile,
    serverFile: result.serverFile,
    ...(result.sharedFile ? { sharedFile: result.sharedFile } : {}),
    manifestFile: result.manifestFile,
    manifest: result.manifest
  };
}

/** Discovers portable eXact manifests explicitly advertised by installed packages. */
export async function discoverExactPackageManifests(
  startDirectory: string
): Promise<ExactDiscoveredPackageManifest[]> {
  const nodeModules = await nearestNodeModules(startDirectory);
  if (!nodeModules) return [];
  const packageRoots: string[] = [];
  for (const entry of await readdir(nodeModules, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const root = path.join(nodeModules, entry.name);
    if (!entry.isDirectory() && !(entry.isSymbolicLink() && await isDirectory(root))) continue;
    if (!entry.name.startsWith("@")) {
      packageRoots.push(root);
      continue;
    }
    for (const scoped of await readdir(root, { withFileTypes: true })) {
      const scopedRoot = path.join(root, scoped.name);
      if (scoped.isDirectory() || scoped.isSymbolicLink() && await isDirectory(scopedRoot)) {
        packageRoots.push(scopedRoot);
      }
    }
  }
  const discovered: ExactDiscoveredPackageManifest[] = [];
  for (const packageRoot of packageRoots.sort()) {
    let packageJson: ExactPackageJson;
    try {
      packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8")) as ExactPackageJson;
    } catch {
      continue;
    }
    const manifests = packageJson.exact?.manifests;
    if (!Array.isArray(manifests) || !manifests.every(value => typeof value === "string")) continue;
    const packageName = packageJson.name ?? path.basename(packageRoot);
    for (const relative of manifests) {
      const manifestFile = path.resolve(packageRoot, relative);
      const relativeToPackage = path.relative(packageRoot, manifestFile);
      if (relativeToPackage.startsWith("..") || path.isAbsolute(relativeToPackage)) {
        throw new Error(`${packageJson.name ?? packageRoot}: eXact manifest escapes its package root`);
      }
      const parsed = parseExactCompilerManifest(
        JSON.parse(await readFile(manifestFile, "utf8")),
        manifestFile
      );
      const manifest = {
        ...parsed,
        packageName
      };
      discovered.push({
        packageName,
        packageRoot,
        manifestFile,
        manifest
      });
    }
  }
  return discovered;
}

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function nearestNodeModules(startDirectory: string): Promise<string | undefined> {
  let current = path.resolve(startDirectory);
  while (true) {
    const candidate = path.join(current, "node_modules");
    try {
      if ((await readdir(candidate, { withFileTypes: true })).length >= 0) return candidate;
    } catch {
      // Continue toward the filesystem root.
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** Diffs two artifact plans into added, removed, changed, and retained entries. */
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

/** Creates conditional package exports for generated client/server component artifacts. */
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
      ...(options.typesRoot ? {
        types: packageExportTarget(
          path.join(
            options.typesRoot,
            path.relative(options.sourceRoot ?? options.packageRoot, result.inputFile)
              .replace(/\.[cm]?[jt]sx?$/i, ".d.ts")
          ),
          options.packageRoot
        )
      } : {}),
      [clientCondition]: client,
      [serverCondition]: server,
      default: options.defaultTarget === "server" ? server : client
    };
  }

  return output;
}

/** Fails when a resolved conditional export does not match the consuming target. */
export function assertExactArtifactTarget(
  entry: ExactArtifactGraphInput,
  resolvedFile: string,
  target: ExactArtifactTarget
): void {
  const expected = path.resolve(target === "client" ? entry.clientFile : entry.serverFile);
  const resolved = path.resolve(resolvedFile);
  if (resolved !== expected) {
    throw new Error(
      `eXact ${target} build resolved ${resolvedFile}, expected ${target === "client" ? entry.clientFile : entry.serverFile}`
    );
  }
}

/** Returns the package export conditions used to select a client or server artifact. */
export function exactExportConditions(
  target: ExactArtifactTarget,
  options: ExactExportConditionOptions = {}
): string[] {
  return [target === "server" ? options.serverCondition ?? "exact-server" : options.clientCondition ?? "exact-client"];
}

/** Resolves a virtual .exact facade import to the generated client or server artifact path. */
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
  // During early resolver passes the artifact may not exist yet; fall back to the
  // extension that matches the importing source language.
  return `${candidateBase}${artifactExtensionPreference(importer)[0]}`;
}

function artifactExtensionPreference(importer: string | undefined): [".ts", ".js"] | [".js", ".ts"] {
  const extension = importer ? path.extname(importer).toLowerCase() : "";
  return extension === ".js" || extension === ".jsx"
    ? [".js", ".ts"]
    : [".ts", ".js"];
}

/** Builds the aggregate graph used by package exports and client/server registries. */
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
      ...(result.sharedFile ? { sharedFile: result.sharedFile } : {}),
      manifestFile: result.manifestFile,
      manifest: result.manifest
    }))
  };
}

/** Extracts render edges across compiled artifact manifests. */
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

/** Creates generated registry module source for client islands and server parts. */
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

/** Reads artifact manifest files back into artifact graph entries. */
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
      ...(manifest.artifacts.shared ? {
        sharedFile: path.resolve(root, manifest.artifacts.shared)
      } : {}),
      manifestFile,
      manifest
    });
  }
  return entries.sort((left, right) => left.manifestFile.localeCompare(right.manifestFile));
}
