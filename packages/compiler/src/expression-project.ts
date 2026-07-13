import { createExpressionProject, ExpressionProject, findExpressionConfig, type BoundModule } from "@exact/expressions";
import path from "node:path";

const projects = new Map<string, ExpressionProject>();
type ModuleCacheEntry = Readonly<{
  filename: string;
  source: string;
  module: BoundModule;
  dependencies: readonly string[];
}>;

const modules = new Map<string, ModuleCacheEntry>();
const dependents = new Map<string, Set<string>>();

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

function moduleDependencies(filename: string, module: BoundModule): readonly string[] {
  const dependencies = new Set<string>();
  for (const reference of module.walk().references()) {
    const specifier = reference.variable?.importedFrom;
    if (specifier) for (const candidate of dependencyCandidates(filename, specifier)) dependencies.add(candidate);
  }
  return [...dependencies];
}

function removeCacheEntry(moduleKey: string): ModuleCacheEntry | undefined {
  const entry = modules.get(moduleKey);
  if (!entry) return undefined;
  modules.delete(moduleKey);
  for (const dependency of entry.dependencies) {
    const consumers = dependents.get(dependency);
    consumers?.delete(moduleKey);
    if (consumers?.size === 0) dependents.delete(dependency);
  }
  return entry;
}

function invalidateDependents(filename: string, seen = new Set<string>()): void {
  const target = canonical(filename);
  if (seen.has(target)) return;
  seen.add(target);
  for (const moduleKey of [...(dependents.get(target) ?? [])]) {
    const entry = removeCacheEntry(moduleKey);
    if (entry) invalidateDependents(entry.filename, seen);
  }
}

/**
 * Returns the shared incremental semantic project used by every compiler entry
 * point and adapter. The TypeScript Program remains private to expressions.
 */
export function expressionModuleFor(filename: string, source: string): BoundModule {
  const virtual = !path.isAbsolute(filename);
  const absolute = path.resolve(filename);
  const config = findExpressionConfig(path.dirname(absolute)) ?? findExpressionConfig(process.cwd());
  if (!config) {
    // ExpressionProject turns this into the package's structured configuration
    // diagnostic. Keep the selection policy in one place.
    return createExpressionProject({ cwd: path.dirname(absolute) }).updateModule(absolute, source);
  }
  // Relative filenames are isolated compiler snippets. Keeping each virtual
  // filename in its own Program prevents unrelated script-mode snippets from
  // merging global declarations while real absolute project files still share
  // the incremental service.
  const configPath = path.resolve(config);
  const key = `${configPath}${virtual ? `::virtual:${absolute}` : ""}`;
  const canonicalFile = canonical(absolute);
  const moduleKey = `${key}::file:${canonicalFile}`;
  const cached = modules.get(moduleKey);
  if (cached?.source === source) return cached.module;
  let project = projects.get(key);
  if (!project) {
    project = createExpressionProject({ tsconfigPath: configPath });
    projects.set(key, project);
  }
  invalidateDependents(absolute);
  removeCacheEntry(moduleKey);
  const module = project.updateModule(absolute, source);
  const dependencies = moduleDependencies(absolute, module);
  modules.set(moduleKey, { filename: absolute, source, module, dependencies });
  for (const dependency of dependencies) {
    let consumers = dependents.get(dependency);
    if (!consumers) dependents.set(dependency, consumers = new Set());
    consumers.add(moduleKey);
  }
  return module;
}

/** Primarily for isolated tests and long-running hosts that dispose a workspace. */
export function clearExpressionProjectCache(): void {
  projects.clear();
  modules.clear();
  dependents.clear();
}
