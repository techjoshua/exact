import { createExpressionProject, ExpressionProject, type BoundModule } from "@exact/expressions";
import path from "node:path";
import ts from "typescript";

const projects = new Map<string, ExpressionProject>();
const modules = new Map<string, Readonly<{ source: string; module: BoundModule }>>();

/**
 * Returns the shared incremental semantic project used by every compiler entry
 * point and adapter. The TypeScript Program remains private to expressions.
 */
export function expressionModuleFor(filename: string, source: string): BoundModule {
  const absolute = path.resolve(filename);
  const cached = modules.get(absolute);
  if (cached?.source === source) return cached.module;
  const config = ts.findConfigFile(path.dirname(absolute), ts.sys.fileExists, "tsconfig.json")
    ?? ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");
  if (!config) {
    // ExpressionProject turns this into the package's structured configuration
    // diagnostic. Keep the selection policy in one place.
    return createExpressionProject({ cwd: path.dirname(absolute) }).updateModule(absolute, source);
  }
  const key = path.resolve(config);
  let project = projects.get(key);
  if (!project) {
    project = createExpressionProject({ tsconfigPath: key });
    projects.set(key, project);
  }
  const module = project.updateModule(absolute, source);
  modules.set(absolute, { source, module });
  return module;
}

/** Primarily for isolated tests and long-running hosts that dispose a workspace. */
export function clearExpressionProjectCache(): void {
  projects.clear();
  modules.clear();
}
