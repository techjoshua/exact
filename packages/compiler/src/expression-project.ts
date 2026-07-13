import { createExpressionProject, ExpressionProject, findExpressionConfig, type BoundModule } from "@exact/expressions";
import path from "node:path";

const projects = new Map<string, ExpressionProject>();
const modules = new Map<string, Readonly<{ source: string; module: BoundModule }>>();

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
  const cached = modules.get(key);
  if (cached?.source === source) return cached.module;
  let project = projects.get(key);
  if (!project) {
    project = createExpressionProject({ tsconfigPath: configPath });
    projects.set(key, project);
  }
  const module = project.updateModule(absolute, source);
  modules.set(key, { source, module });
  return module;
}

/** Primarily for isolated tests and long-running hosts that dispose a workspace. */
export function clearExpressionProjectCache(): void {
  projects.clear();
  modules.clear();
}
