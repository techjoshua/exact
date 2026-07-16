import { createExpressionProject, ExpressionProject, findExpressionConfig, type BoundModule } from "@exact/expressions";
import fs from "node:fs";
import path from "node:path";

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
}>;

export type ExactCompilerSessionStats = Readonly<{
  workspaces: number;
  rebuilds: number;
  modules: number;
  dependencyEntries: number;
  overlays: number;
  sourceFiles: number;
  nodeIdentityRoots: number;
  symbolIdentities: number;
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
  for (const declaration of module.walk().ofKind("ImportDeclaration")) {
    const match = /\bfrom\s*(["'])(.*?)\1|^\s*import\s*(["'])(.*?)\3/.exec(declaration.node.text ?? "");
    const specifier = match?.[2] ?? match?.[4];
    if (!specifier) continue;
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
  private disposed = false;

  expressionModuleFor(filename: string, source: string, options: ExpressionModuleOptions = {}): BoundModule {
    this.assertActive();
    const virtual = options.virtual ?? !path.isAbsolute(filename);
    const relative = virtual ? this.relativeLocation(filename, options.root) : undefined;
    const root = relative?.root;
    const absolute = relative?.absolute ?? path.resolve(filename);
    const config = findExpressionConfig(path.dirname(absolute)) ?? findExpressionConfig(root ?? process.cwd());
    if (!config) {
      return createExpressionProject({
        cwd: path.dirname(absolute),
        forceModuleDetection: virtual
      }).updateModule(absolute, source);
    }
    const configPath = path.resolve(config);
    const canonicalConfig = canonical(configPath);
    const projectKey = virtual ? `${canonicalConfig}::virtual-root:${canonical(root!)}` : canonicalConfig;
    const moduleKey = this.moduleKey(projectKey, absolute);
    const cached = this.modules.get(moduleKey);
    if (cached?.source === source) return cached.module;
    let project = this.projects.get(projectKey);
    if (!project) {
      project = createExpressionProject({ tsconfigPath: configPath, forceModuleDetection: virtual });
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
  invalidate(filename: string, removed = false): void {
    this.assertActive();
    const absolute = path.resolve(filename);
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
        for (const file of files) project.removeModule(file);
      } else {
        project.invalidateFile(absolute);
      }
    }
  }

  clear(): void {
    for (const project of this.projects.values()) project.dispose();
    this.projects.clear();
    this.modules.clear();
    this.dependents.clear();
    this.inferredRoots.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
  }

  stats(): ExactCompilerSessionStats {
    let rebuilds = 0;
    let overlays = 0;
    let sourceFiles = 0;
    let nodeIdentityRoots = 0;
    let symbolIdentities = 0;
    for (const project of this.projects.values()) {
      const stats = project.stats();
      rebuilds += stats.rebuilds;
      overlays += stats.overlays;
      sourceFiles += stats.sourceFiles;
      nodeIdentityRoots += stats.nodeIdentityRoots;
      symbolIdentities += stats.symbolIdentities;
    }
    return Object.freeze({
      workspaces: this.projects.size,
      rebuilds,
      modules: this.modules.size,
      dependencyEntries: this.dependents.size,
      overlays,
      sourceFiles,
      nodeIdentityRoots,
      symbolIdentities
    });
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("This eXact compiler session has been disposed");
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

export function createCompilerSession(): ExactCompilerSession {
  return new ExactCompilerSession();
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
