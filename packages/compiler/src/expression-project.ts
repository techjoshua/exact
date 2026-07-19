import {
  createExpressionLanguageService,
  createExpressionProject,
  ExpressionProject,
  findExpressionConfig,
  type BoundModule,
  type ExpressionDiagnostic,
  type ExpressionLanguageService,
  type ExpressionLanguageServiceUpdate,
  type ExpressionProjectProfileEvent
} from "@exact/expressions";
import type { ExactProfileEvent, ExactProfileSink } from "@exact/instrumentation";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { performance } from "node:perf_hooks";

type ModuleCacheEntry = Readonly<{
  projectKey: string;
  filename: string;
  source: string;
  module: BoundModule;
  dependencies: readonly string[];
}>;

export type ExpressionModuleOptions = Readonly<{
  root?: string;
  virtual?: boolean;
  diagnostics?: "syntax" | "full";
}>;

export type ExactCompilerSessionStats = Readonly<{
  workspaces: number;
  rebuilds: number;
  semanticDiagnostics: number;
  modules: number;
  dependencyEntries: number;
  overlays: number;
  sourceFiles: number;
  nodeIdentityRoots: number;
  symbolIdentities: number;
  languageServices: number;
  languageServiceAffectedFiles: number;
  languageServiceSynchronizationMs: number;
}>;

export type ExactCompilerSessionOptions = Readonly<{
  languageService?: boolean;
  /** Receives compiler and nested expression profiling observations. */
  onProfile?: ExactProfileSink<ExactCompilerProfileEvent | ExpressionProjectProfileEvent>;
}>;

export type ExactCompilerProfileEvent = ExactProfileEvent<
  "compiler",
  "expression-module" | "invalidate" | "clear"
>;

export type ExactCompilerInvalidation = Readonly<{
  affectedFiles: readonly string[];
  diagnostics: readonly ExpressionDiagnostic[];
}>;

function canonical(filename: string): string {
  const absolute = path.resolve(filename);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function dependencyCandidates(filename: string, specifier: string): readonly string[] {
  if (!specifier.startsWith(".")) return [];
  const resolved = path.resolve(path.dirname(filename), specifier);
  const extension = path.extname(resolved);
  const stem = extension ? resolved.slice(0, -extension.length) : resolved;
  return [...new Set([resolved, `${stem}.ts`, `${stem}.tsx`, `${stem}.mts`, `${stem}.cts`].map(canonical))];
}

function moduleDependencies(filename: string, module: BoundModule, project: ExpressionProject): readonly string[] {
  const dependencies = new Set<string>();
  const imports = ts.preProcessFile(module.source, true, true).importedFiles;
  for (const imported of imports) {
    const specifier = imported.fileName;
    const resolved = project.resolveModuleSpecifier(specifier, filename);
    if (resolved) dependencies.add(canonical(resolved));
    for (const candidate of dependencyCandidates(filename, specifier)) dependencies.add(candidate);
  }
  return [...dependencies];
}

/** Owns incremental TypeScript state for one compiler or bundler lifecycle. */
export class ExactCompilerSession {
  private readonly projects = new Map<string, ExpressionProject>();
  private readonly modules = new Map<string, ModuleCacheEntry>();
  private readonly dependents = new Map<string, Set<string>>();
  private readonly inferredRoots = new Map<string, string>();
  private readonly languageServices = new Map<string, ExpressionLanguageService>();
  private readonly languageServiceEnabled: boolean;
  private readonly onProfile?: ExactProfileSink<ExactCompilerProfileEvent | ExpressionProjectProfileEvent>;
  private disposed = false;

  constructor(options: ExactCompilerSessionOptions = {}) {
    this.languageServiceEnabled = options.languageService ?? false;
    this.onProfile = options.onProfile;
  }

  expressionModuleFor(filename: string, source: string, options: ExpressionModuleOptions = {}): BoundModule {
    this.assertActive();
    const profileStarted = this.onProfile ? performance.now() : undefined;
    const virtual = options.virtual ?? !path.isAbsolute(filename);
    const relative = virtual ? this.relativeLocation(filename, options.root) : undefined;
    const root = relative?.root;
    const absolute = relative?.absolute ?? path.resolve(filename);
    const config = findExpressionConfig(path.dirname(absolute)) ?? findExpressionConfig(root ?? process.cwd());
    if (!config) {
      const module = createExpressionProject({
        cwd: path.dirname(absolute),
        forceModuleDetection: virtual,
        onProfile: this.onProfile
      }).updateModule(absolute, source);
      this.profile("expression-module", profileStarted, { cached: 0, dependencies: 0 });
      return module;
    }
    const configPath = path.resolve(config);
    const canonicalConfig = canonical(configPath);
    if (this.languageServiceEnabled && !absolute.includes(".exact.generated.")) {
      const update = this.languageServiceFor(configPath).synchronize([{
        filename: absolute,
        kind: "upsert",
        source
      }]);
      this.invalidateLanguageServiceAffected(update, absolute);
    }
    const diagnosticMode = options.diagnostics ?? "syntax";
    const configuredKey = `${canonicalConfig}::diagnostics:${diagnosticMode}`;
    const projectKey = virtual ? `${configuredKey}::virtual-root:${canonical(root!)}` : configuredKey;
    const moduleKey = this.moduleKey(projectKey, absolute);
    const cached = this.modules.get(moduleKey);
    if (cached?.source === source) {
      this.profile("expression-module", profileStarted, { cached: 1 });
      return cached.module;
    }
    let project = this.projects.get(projectKey);
    if (!project) {
      project = createExpressionProject({
        tsconfigPath: configPath,
        forceModuleDetection: virtual,
        diagnostics: diagnosticMode,
        onProfile: this.onProfile
      });
      this.projects.set(projectKey, project);
    }
    this.invalidateDependents(absolute);
    this.removeCacheEntry(moduleKey);
    const module = project.updateModule(absolute, source);
    const dependencies = moduleDependencies(absolute, module, project);
    this.modules.set(moduleKey, { projectKey, filename: absolute, source, module, dependencies });
    for (const dependency of dependencies) {
      let consumers = this.dependents.get(dependency);
      if (!consumers) this.dependents.set(dependency, consumers = new Set());
      consumers.add(moduleKey);
    }
    this.profile("expression-module", profileStarted, { cached: 0, dependencies: dependencies.length });
    return module;
  }

  expressionDependencyFiles(filename: string, source: string, options: ExpressionModuleOptions = {}): readonly string[] {
    this.expressionModuleFor(filename, source, options);
    const target = canonical(options.virtual ?? !path.isAbsolute(filename)
      ? this.relativeLocation(filename, options.root).absolute
      : filename);
    const entry = [...this.modules.values()].find(candidate => canonical(candidate.filename) === target && candidate.source === source);
    return entry?.dependencies ?? [];
  }

  /** Invalidates only workspaces that contain the file or a tracked consumer. */
  invalidate(filename: string, removed = false): ExactCompilerInvalidation {
    this.assertActive();
    const profileStarted = this.onProfile ? performance.now() : undefined;
    const absolute = path.resolve(filename);
    const update = this.synchronizeLanguageServiceFile(absolute, removed);
    this.invalidateTracked(absolute, removed);
    for (const affected of update.affectedFiles) {
      if (canonical(affected) !== canonical(absolute)) this.invalidateTracked(affected, false);
    }
    const result = Object.freeze({
      affectedFiles: Object.freeze([
        ...new Set([absolute, ...update.affectedFiles].map((filename) => path.resolve(filename))),
      ]),
      diagnostics: update.diagnostics
    });
    this.profile("invalidate", profileStarted, { affectedFiles: result.affectedFiles.length });
    return result;
  }

  private invalidateTracked(absolute: string, removed: boolean): void {
    const target = canonical(absolute);
    const affectedProjects = new Set<string>();
    const affectedModuleKeys = new Set<string>();
    const removedFilesByProject = new Map<string, Set<string>>();
    for (const [key, entry] of this.modules) {
      const entryFile = canonical(entry.filename);
      if (entryFile === target || entryFile.startsWith(`${target}.exact.generated.`)) {
        affectedProjects.add(entry.projectKey);
        affectedModuleKeys.add(key);
      }
    }
    for (const key of this.collectDependentModuleKeys(absolute)) {
      const entry = this.modules.get(key);
      if (entry) affectedProjects.add(entry.projectKey);
    }
    this.invalidateDependents(absolute);
    for (const key of affectedModuleKeys) {
      const entry = this.removeCacheEntry(key);
      if (entry) {
        affectedProjects.add(entry.projectKey);
        let files = removedFilesByProject.get(entry.projectKey);
        if (!files) removedFilesByProject.set(entry.projectKey, files = new Set());
        files.add(entry.filename);
      }
    }
    for (const projectKey of affectedProjects) {
      const project = this.projects.get(projectKey);
      if (!project) continue;
      if (removed) {
        const files = removedFilesByProject.get(projectKey) ?? new Set([absolute]);
        files.add(absolute);
        project.removeModules(files);
      } else {
        project.invalidateFile(absolute);
      }
    }
  }

  clear(): void {
    const profileStarted = this.onProfile ? performance.now() : undefined;
    const projectCount = this.projects.size;
    const moduleCount = this.modules.size;
    for (const project of this.projects.values()) project.dispose();
    this.projects.clear();
    this.modules.clear();
    this.dependents.clear();
    this.inferredRoots.clear();
    for (const service of this.languageServices.values()) service.dispose();
    this.languageServices.clear();
    this.profile("clear", profileStarted, { projects: projectCount, modules: moduleCount });
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
  }

  stats(): ExactCompilerSessionStats {
    let rebuilds = 0;
    let semanticDiagnostics = 0;
    let overlays = 0;
    let sourceFiles = 0;
    let nodeIdentityRoots = 0;
    let symbolIdentities = 0;
    let languageServiceAffectedFiles = 0;
    let languageServiceSynchronizationMs = 0;
    for (const project of this.projects.values()) {
      const stats = project.stats();
      rebuilds += stats.rebuilds;
      semanticDiagnostics += stats.semanticDiagnostics;
      overlays += stats.overlays;
      sourceFiles += stats.sourceFiles;
      nodeIdentityRoots += stats.nodeIdentityRoots;
      symbolIdentities += stats.symbolIdentities;
    }
    for (const service of this.languageServices.values()) {
      const stats = service.stats();
      languageServiceAffectedFiles += stats.affectedFiles;
      languageServiceSynchronizationMs += stats.synchronizationMs;
    }
    return Object.freeze({
      workspaces: this.projects.size,
      rebuilds,
      semanticDiagnostics,
      modules: this.modules.size,
      dependencyEntries: this.dependents.size,
      overlays,
      sourceFiles,
      nodeIdentityRoots,
      symbolIdentities,
      languageServices: this.languageServices.size,
      languageServiceAffectedFiles,
      languageServiceSynchronizationMs
    });
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("This eXact compiler session has been disposed");
  }

  private profile(
    phase: ExactCompilerProfileEvent["phase"],
    started: number | undefined,
    counts?: Readonly<Record<string, number>>
  ): void {
    if (started === undefined) return;
    this.onProfile?.(Object.freeze({
      subsystem: "compiler",
      phase,
      elapsedMs: performance.now() - started,
      ...(counts ? { counts } : {})
    }));
  }

  private languageServiceFor(configPath: string): ExpressionLanguageService {
    const key = canonical(configPath);
    let service = this.languageServices.get(key);
    if (!service) {
      service = createExpressionLanguageService({ tsconfigPath: configPath });
      this.languageServices.set(key, service);
    }
    return service;
  }

  private synchronizeLanguageServiceFile(filename: string, removed: boolean): ExpressionLanguageServiceUpdate {
    if (!this.languageServiceEnabled || filename.includes(".exact.generated.")) {
      return { generation: 0, changedFiles: [], affectedFiles: [], diagnostics: [] };
    }
    const config = findExpressionConfig(path.dirname(filename));
    if (!config) return { generation: 0, changedFiles: [], affectedFiles: [], diagnostics: [] };
    return this.languageServiceFor(config).synchronize([{
      filename,
      kind: removed ? "delete" : "upsert"
    }]);
  }

  private invalidateLanguageServiceAffected(update: ExpressionLanguageServiceUpdate, changed: string): void {
    for (const affected of update.affectedFiles) {
      if (canonical(affected) !== canonical(changed)) this.invalidateTracked(affected, false);
    }
  }

  private nearestPackageRoot(start: string): string {
    const initial = path.resolve(start);
    const cached = this.inferredRoots.get(canonical(initial));
    if (cached) return cached;
    let current = initial;
    while (true) {
      if (fs.existsSync(path.join(current, "package.json"))) {
        this.inferredRoots.set(canonical(initial), current);
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        this.inferredRoots.set(canonical(initial), initial);
        return initial;
      }
      current = parent;
    }
  }

  private relativeLocation(filename: string, explicitRoot?: string): Readonly<{ root: string; absolute: string }> {
    if (explicitRoot) {
      const root = path.resolve(explicitRoot);
      return { root, absolute: path.resolve(root, filename) };
    }
    const absolute = path.resolve(filename);
    return { root: this.nearestPackageRoot(path.dirname(absolute)), absolute };
  }

  private moduleKey(projectKey: string, filename: string): string {
    return `${projectKey}::file:${canonical(filename)}`;
  }

  private removeCacheEntry(moduleKey: string): ModuleCacheEntry | undefined {
    const entry = this.modules.get(moduleKey);
    if (!entry) return undefined;
    this.modules.delete(moduleKey);
    for (const dependency of entry.dependencies) {
      const consumers = this.dependents.get(dependency);
      consumers?.delete(moduleKey);
      if (consumers?.size === 0) this.dependents.delete(dependency);
    }
    return entry;
  }

  private collectDependentModuleKeys(filename: string, seen = new Set<string>()): Set<string> {
    const target = canonical(filename);
    if (seen.has(target)) return new Set();
    seen.add(target);
    const collected = new Set<string>();
    for (const moduleKey of this.dependents.get(target) ?? []) {
      collected.add(moduleKey);
      const entry = this.modules.get(moduleKey);
      if (entry) for (const nested of this.collectDependentModuleKeys(entry.filename, seen)) collected.add(nested);
    }
    return collected;
  }

  private invalidateDependents(filename: string, seen = new Set<string>()): void {
    const target = canonical(filename);
    if (seen.has(target)) return;
    seen.add(target);
    for (const moduleKey of [...(this.dependents.get(target) ?? [])]) {
      const entry = this.removeCacheEntry(moduleKey);
      if (entry) this.invalidateDependents(entry.filename, seen);
    }
  }
}

const defaultSession = new ExactCompilerSession();

export function createCompilerSession(options: ExactCompilerSessionOptions = {}): ExactCompilerSession {
  return new ExactCompilerSession(options);
}

export function expressionModuleFor(filename: string, source: string, options: ExpressionModuleOptions = {}): BoundModule {
  return defaultSession.expressionModuleFor(filename, source, options);
}

export function expressionDependencyFiles(filename: string, source: string): readonly string[] {
  return defaultSession.expressionDependencyFiles(filename, source);
}

export function clearExpressionProjectCache(): void {
  defaultSession.clear();
}

export function invalidateExpressionModule(filename: string, removed = false): void {
  defaultSession.invalidate(filename, removed);
}
