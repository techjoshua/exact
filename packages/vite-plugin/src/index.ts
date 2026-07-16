import {
  exactExportConditions,
  createLineSourceMap,
  createCompilerSession,
  parseExactCompilerManifest,
  resolveExactArtifactImport,
  transformSource,
  type ExactCompilerManifest,
  type TransformTarget
} from "@exact/compiler";
import { transformReactJsx, usesReactRuntimeImports } from "@exact/react-compat/transform";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  jsxSourceOwnership,
  resolveReactCompatibility,
  validateInstalledReactReconciler,
  type ReactCompatibilityOptions,
  type ResolvedReactCompatibility
} from "@exact/react-compat/plugin";
import { createReactCompatibilityBuildEngine, type ReactCompatibilityBuildEngine } from "@exact/react-compat/build";

export type ExactPluginOptions = {
  include?: FilterPattern;
  exclude?: FilterPattern;
  target?: TransformTarget;
  importedManifests?: readonly ExactCompilerManifest[];
  manifestFiles?: readonly string[];
  clientCondition?: string;
  serverCondition?: string;
  serverComponents?: boolean;
  sourceMap?: boolean;
  reactCompatibility?: boolean | ReactCompatibilityOptions;
};

type FilterPattern = string | RegExp | readonly (string | RegExp)[];

export type ExactPlugin = {
  name: string;
  enforce: "pre";
  warn?(message: string): void;
  config?(): { resolve: { conditions: string[]; alias?: Array<{ find: RegExp; replacement: string }> } };
  buildStart?(this: { addWatchFile(file: string): void }): void;
  configureServer?(server: {
    httpServer?: { once(event: "close", listener: () => void): unknown };
    watcher?: { once(event: "close", listener: () => void): unknown };
  }): void;
  resolveId?(source: string, importer?: string): string | null;
  transform(this: { warn?(message: string): void }, code: string, id: string): { code: string; map: unknown } | null;
  handleHotUpdate?(context: { file: string }): void;
  watchChange?(id: string, change: { event: "create" | "update" | "delete" }): void;
  closeBundle?(): void;
};

/** Creates the Vite plugin that transforms eXact JSX and resolves .exact facade imports. */
export function exact(options: ExactPluginOptions = {}): ExactPlugin {
  const compilerSession = createCompilerSession();
  const compatibilityCwd = typeof options.reactCompatibility === "object" ? options.reactCompatibility.cwd : undefined;
  const reactCompatibility = resolveReactCompatibility(options.reactCompatibility, compatibilityCwd);
  const compatibilityEngine = reactCompatibility
    ? createReactCompatibilityBuildEngine(typeof options.reactCompatibility === "object"
      ? options.reactCompatibility
      : { cwd: compatibilityCwd, target: reactCompatibility.target })
    : undefined;
  return {
    name: "exact",
    enforce: "pre",
    config() {
      return {
        resolve: {
          conditions: exactExportConditions(options.target === "server" ? "server" : "client", options),
          ...(reactCompatibility ? { alias: viteReactAliases(reactCompatibility) } : {})
        }
      };
    },
    buildStart() {
      for (const file of compatibilityEngine?.watchFiles ?? []) this.addWatchFile(file);
    },
    configureServer(server) {
      server.httpServer?.once("close", () => compilerSession.dispose());
      server.watcher?.once("close", () => compilerSession.dispose());
    },
    resolveId(source, importer) {
      if (source === "react-reconciler" && reactCompatibility) {
        validateInstalledReactReconciler(reactCompatibility.target, importer ? path.dirname(importer) : process.cwd());
      }
      return resolveExactArtifactImport(source, importer, options.target === "server" ? "server" : "client")?.id ?? null;
    },
    handleHotUpdate(context) {
      compatibilityEngine?.invalidate(context.file);
      // Semantic changes can originate in imported .ts/.d.ts files or the
      // project config even when that file itself contains no JSX.
      if (/(?:^|[\\/])tsconfig(?:\.[^\\/]+)?\.json$/i.test(context.file)) compilerSession.clear();
      else compilerSession.invalidate(context.file);
    },
    watchChange(id, change) {
      compatibilityEngine?.invalidate(id);
      if (/(?:^|[\\/])tsconfig(?:\.[^\\/]+)?\.json$/i.test(id)) compilerSession.clear();
      else compilerSession.invalidate(id, change.event === "delete");
    },
    closeBundle() {
      compilerSession.dispose();
    },
    transform(code, id) {
      if (!isTransformableModule(id)) return null;
      try {
        const ownership = jsxSourceOwnership(id, code, reactCompatibility);
        const reactOwned = ownership === "react" || ownership === "unknown" && usesReactRuntimeImports(code, id);
        if (reactOwned && containsJsx(id, code)) {
          if (!reactCompatibility) return null;
          const lowered = transformReactJsx(code, {
            filename: id,
            target: reactCompatibility.target,
            sourceMap: false
          });
          return rewriteWithCompatibility(compatibilityEngine!, lowered.code, id, options, code);
        }
        if (shouldCompileExactJsx(id, code, options)) {
          const result = transformSource(code, {
            filename: id,
            session: compilerSession,
            target: options.target,
            importedManifests: importedManifestsFor(options),
            serverComponents: options.serverComponents,
            sourceMap: false
          });
          const rewritten = compatibilityEngine
            ? compatibilityEngine.transformModule({ id, source: result.code, format: "module", target: options.target === "server" ? "server" : "client", sourceMap: false })
            : { code: result.code };
          return {
            code: rewritten.code,
            map: options.sourceMap === false ? null : createLineSourceMap(id, code, rewritten.code)
          };
        }
        if (!compatibilityEngine) return null;
        const rewritten = compatibilityEngine.transformModule({
          id,
          source: code,
          format: /\.c[jt]s(?:$|\?)/i.test(id) ? "commonjs" : "module",
          target: options.target === "server" ? "server" : "client",
          sourceMap: options.sourceMap ?? true
        });
        for (const diagnostic of rewritten.diagnostics) if (diagnostic.severity === "warning") this.warn?.(diagnostic.message);
        return rewritten.changed ? { code: rewritten.code, map: rewritten.map } : null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`eXact JSX transform failed for ${id}\n${message}`);
      }
    }
  };
}

function importedManifestsFor(options: { importedManifests?: readonly ExactCompilerManifest[]; manifestFiles?: readonly string[] }): ExactCompilerManifest[] {
  return [
    ...(options.importedManifests ?? []),
    ...(options.manifestFiles ?? []).map(file => parseExactCompilerManifest(JSON.parse(readFileSync(file, "utf8")), file))
  ];
}

function shouldCompileExactJsx(id: string, code: string, options: ExactPluginOptions): boolean {
  if (!containsJsx(id, code)) return false;
  if (!options.include && /(?:^|[\\/])node_modules(?:[\\/]|$)/.test(id)) return false;
  if (options.include && !matchesFilter(id, options.include)) return false;
  if (options.exclude && matchesFilter(id, options.exclude)) return false;
  return true;
}

function isTransformableModule(id: string): boolean { return /\.[cm]?[jt]sx?(?:$|\?)/i.test(id); }

function containsJsx(id: string, code: string): boolean {
  return /\.[jt]sx(?:$|\?)/i.test(id) && code.includes("<");
}

function rewriteWithCompatibility(
  engine: ReactCompatibilityBuildEngine,
  lowered: string,
  id: string,
  options: ExactPluginOptions,
  original: string
): { code: string; map: unknown } {
  const rewritten = engine.transformModule({
    id,
    source: lowered,
    format: "module",
    target: options.target === "server" ? "server" : "client",
    sourceMap: false
  });
  return { code: rewritten.code, map: options.sourceMap === false ? null : createLineSourceMap(id, original, rewritten.code) };
}

function viteReactAliases(resolved: ResolvedReactCompatibility): Array<{ find: RegExp; replacement: string }> {
  return Object.entries(resolved.aliases).map(([find, replacement]) => ({
    find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    replacement
  }));
}

function matchesFilter(id: string, pattern: FilterPattern): boolean {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  return patterns.some(item => typeof item === "string" ? id.includes(item) : item.test(id));
}
