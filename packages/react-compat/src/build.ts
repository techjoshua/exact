import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { rewriteModuleReferences, type ModuleExportReplacement, type ModuleRewriteOptions } from "@exact/expressions";
import {
  createReactCompatPackageGraph,
  discoverReactCompatAdapters,
  replacementsForImporter,
  type ReactCompatPackageGraph,
  type ResolvedReactCompatAdapters
} from "./adapters.js";
import { resolveReactCompatibility, type ReactCompatibilityOptions, type ResolvedReactCompatibility } from "./plugin.js";

export interface ReactCompatibilityBuildInput {
  readonly id: string;
  readonly source: string;
  readonly format: "module" | "commonjs";
  readonly target: "client" | "server";
  readonly sourceMap?: boolean;
}

export interface ReactCompatibilityDiagnostic {
  readonly severity: "info" | "warning" | "error";
  readonly code: "dynamic-export-escape" | "unsupported-commonjs" | "compatibility-retained";
  readonly message: string;
  readonly moduleId: string;
  readonly sourceModule: string;
  readonly sourceExport: string;
  readonly sourceVersion: string;
  readonly adapterPackage: string;
  readonly adapterVersion: string;
  readonly replacementExport: string;
  readonly buildRoot: string;
}

export interface ReactCompatibilityTransformResult {
  readonly code: string;
  readonly map: unknown;
  readonly changed: boolean;
  readonly watchFiles: readonly string[];
  readonly dependencyIds: readonly string[];
  readonly diagnostics: readonly ReactCompatibilityDiagnostic[];
  readonly registryHash: string;
}

export interface ReactCompatibilityReport {
  readonly buildRoot: string;
  readonly target: 18 | 19;
  readonly registryHash: string;
  readonly activeAdapters: readonly string[];
  readonly ignoredAdapters: readonly string[];
  readonly unusedAdapters: readonly string[];
  readonly substitutions: readonly Readonly<{
    sourceModule: string;
    sourceExport: string;
    sourceVersion: string;
    adapterPackage: string;
    adapterVersion: string;
    targetModule: string;
    targetExport: string;
  }>[];
  readonly watchFiles: readonly string[];
}

export interface ReactCompatibilityBuildEngine {
  readonly resolved: ResolvedReactCompatibility;
  readonly rewriteOptions: ModuleRewriteOptions;
  readonly watchFiles: readonly string[];
  readonly registryHash: string;
  transformModule(input: ReactCompatibilityBuildInput): ReactCompatibilityTransformResult;
  invalidate(file: string): void;
  report(): ReactCompatibilityReport;
}

type CachedDiscovery = {
  signature: string;
  registry: ResolvedReactCompatAdapters;
  graph: ReactCompatPackageGraph;
  /** Context-free replacements retained for hosts that only consume rewrite options. */
  replacements: readonly ModuleExportReplacement[];
  watchFiles: readonly string[];
  hash: string;
};

const discoveryCache = new Map<string, CachedDiscovery>();

/** Shared discovery and module-rewrite engine used by every initial host. */
export function createReactCompatibilityBuildEngine(options: ReactCompatibilityOptions = {}): ReactCompatibilityBuildEngine {
  const buildRoot = path.resolve(options.cwd ?? process.cwd());
  const resolved = resolveReactCompatibility(options, buildRoot);
  if (!resolved) throw new Error("React compatibility build engine cannot be disabled");
  let invalidated = false;
  const usedAdapters = new Set<string>();
  const state = (): CachedDiscovery => {
    const existing = discoveryCache.get(buildRoot);
    if (!invalidated && existing && existing.signature === fileSignature(existing.watchFiles)) return existing;
    invalidated = false;
    const graph = createReactCompatPackageGraph(buildRoot);
    const registry = discoverReactCompatAdapters(graph);
    const replacements = moduleReplacements([...registry.replacements.values()]);
    const watchFiles = discoverWatchFiles(buildRoot, graph, registry.adapters);
    const hash = createHash("sha256").update(JSON.stringify(replacements)).digest("hex").slice(0, 16);
    const next = { signature: fileSignature(watchFiles), registry, graph, replacements, watchFiles, hash };
    discoveryCache.set(buildRoot, next);
    return next;
  };
  const engine: ReactCompatibilityBuildEngine = {
    resolved,
    get rewriteOptions() { return Object.freeze({ moduleAliases: resolved.aliases, replacements: state().replacements }); },
    get watchFiles() { return state().watchFiles; },
    get registryHash() { return state().hash; },
    transformModule(input) {
      const current = state();
      const resolvedReplacements = replacementsForImporter(current.graph, current.registry, input.id);
      const replacements = moduleReplacements(resolvedReplacements);
      if (!containsCandidate(input.source, resolved.aliases, replacements)) {
        return Object.freeze({ code: input.source, map: null, changed: false, watchFiles: current.watchFiles, dependencyIds: [], diagnostics: [], registryHash: current.hash });
      }
      const diagnostics = fallbackDiagnostics(input.id, input.source, resolvedReplacements, buildRoot);
      const transformed = rewriteModuleReferences(input.source, {
        filename: input.id,
        moduleAliases: resolved.aliases,
        replacements,
        sourceMap: input.sourceMap ?? true
      });
      const dependencyIds = replacements
        .map(replacement => replacement.targetModule)
        .filter((value, index, values) => values.indexOf(value) === index && containsModule(transformed.code, value));
      for (const dependency of dependencyIds) {
        const adapter = [...current.registry.replacements.values()].find(value => value.specifier === dependency)?.adapterPackage;
        if (adapter) usedAdapters.add(adapter);
      }
      diagnostics.push(...retainedDiagnostics(input.id, transformed.code, current.registry, buildRoot));
      return Object.freeze({
        code: transformed.code,
        map: transformed.map,
        changed: transformed.changed,
        watchFiles: current.watchFiles,
        dependencyIds: Object.freeze(dependencyIds),
        diagnostics: Object.freeze(diagnostics),
        registryHash: current.hash
      });
    },
    invalidate(file) {
      const current = discoveryCache.get(buildRoot);
      const normalized = path.resolve(file).toLowerCase();
      if (!current || current.watchFiles.some(watch => path.resolve(watch).toLowerCase() === normalized)) {
        invalidated = true;
        discoveryCache.delete(buildRoot);
      }
    },
    report() {
      const current = state();
      return Object.freeze({
        buildRoot,
        target: resolved.target,
        registryHash: current.hash,
        activeAdapters: current.registry.adapters,
        ignoredAdapters: current.registry.ignoredAdapters,
        unusedAdapters: Object.freeze(current.registry.adapters.filter(adapter => !usedAdapters.has(adapter))),
        substitutions: Object.freeze([...current.registry.replacements.values()].map(replacement => Object.freeze({
          sourceModule: replacement.sourceModule,
          sourceExport: replacement.sourceExport,
          sourceVersion: replacement.sourceVersion,
          adapterPackage: replacement.adapterPackage,
          adapterVersion: replacement.adapterVersion,
          targetModule: replacement.specifier,
          targetExport: replacement.export
        }))),
        watchFiles: current.watchFiles
      });
    }
  };
  return Object.freeze(engine);
}

function moduleReplacements(
  values: readonly import("./adapters.js").ResolvedReactCompatReplacement[]
): readonly ModuleExportReplacement[] {
  return values.map(replacement => ({
    sourceModule: replacement.sourceModule,
    sourceExport: replacement.sourceExport,
    targetModule: replacement.specifier,
    targetExport: replacement.export
  }));
}

function discoverWatchFiles(
  buildRoot: string,
  graph: ReturnType<typeof createReactCompatPackageGraph>,
  adapters: readonly string[]
): readonly string[] {
  const files = new Set<string>();
  const root = graph.nodes.get(graph.rootId);
  if (root) files.add(path.join(root.location, "package.json"));
  for (const node of graph.nodes.values()) {
    if (typeof node.manifest.name === "string" && adapters.includes(node.manifest.name)) files.add(path.join(node.location, "package.json"));
  }
  try { files.add(findUp(buildRoot, "package-lock.json")); } catch {}
  return Object.freeze([...files].sort());
}

function fileSignature(files: readonly string[]): string {
  return files.map(file => {
    try { const stat = statSync(file); return `${file}:${stat.size}:${stat.mtimeMs}`; }
    catch { return `${file}:missing`; }
  }).join("|");
}

function findUp(cwd: string, filename: string): string {
  let directory = path.resolve(cwd);
  while (true) {
    const candidate = path.join(directory, filename);
    try { readFileSync(candidate, "utf8"); return candidate; } catch {}
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`${filename} was not found above ${cwd}`);
    directory = parent;
  }
}

function containsCandidate(source: string, aliases: Readonly<Record<string, string>>, replacements: readonly ModuleExportReplacement[]): boolean {
  return [...Object.keys(aliases), ...replacements.map(value => value.sourceModule)]
    .some(module => containsModule(source, module));
}

function containsModule(source: string, module: string): boolean {
  return source.includes(`"${module}"`) || source.includes(`'${module}'`);
}

function fallbackDiagnostics(
  moduleId: string,
  source: string,
  replacements: readonly import("./adapters.js").ResolvedReactCompatReplacement[],
  buildRoot: string
): ReactCompatibilityDiagnostic[] {
  const diagnostics: ReactCompatibilityDiagnostic[] = [];
  for (const replacement of replacements) {
    const sourceModule = replacement.sourceModule;
    const escaped = sourceModule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\bimport\\s*\\(\\s*["']${escaped}["']`).test(source)) diagnostics.push({
      severity: "warning",
      code: "dynamic-export-escape",
      message: `Dynamic import of ${sourceModule} cannot select registered export replacements statically`,
      moduleId,
      sourceModule,
      sourceExport: replacement.sourceExport,
      sourceVersion: replacement.sourceVersion,
      adapterPackage: replacement.adapterPackage,
      adapterVersion: replacement.adapterVersion,
      replacementExport: replacement.export,
      buildRoot
    });
    if (new RegExp(`\\{[^}]*\\.\\.\\.[^}]*\\}\\s*=\\s*require\\(\\s*["']${escaped}["']`).test(source)) diagnostics.push({
      severity: "warning",
      code: "unsupported-commonjs",
      message: `Rest destructuring from ${sourceModule} remains on the compatibility source module`,
      moduleId,
      sourceModule,
      sourceExport: replacement.sourceExport,
      sourceVersion: replacement.sourceVersion,
      adapterPackage: replacement.adapterPackage,
      adapterVersion: replacement.adapterVersion,
      replacementExport: replacement.export,
      buildRoot
    });
  }
  return diagnostics;
}

function retainedDiagnostics(
  moduleId: string,
  code: string,
  registry: ResolvedReactCompatAdapters,
  buildRoot: string
): ReactCompatibilityDiagnostic[] {
  const diagnostics: ReactCompatibilityDiagnostic[] = [];
  for (const replacement of registry.replacements.values()) {
    if (!containsModule(code, replacement.sourceModule)) continue;
    diagnostics.push({
      severity: "info",
      code: "compatibility-retained",
      message: `${replacement.sourceModule} remains because this module has runtime uses outside the ${replacement.sourceExport} substitution`,
      moduleId,
      sourceModule: replacement.sourceModule,
      sourceExport: replacement.sourceExport,
      sourceVersion: replacement.sourceVersion,
      adapterPackage: replacement.adapterPackage,
      adapterVersion: replacement.adapterVersion,
      replacementExport: replacement.export,
      buildRoot
    });
  }
  return diagnostics;
}
