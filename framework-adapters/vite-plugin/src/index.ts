import {
  exactExportConditions,
  createLineSourceMap,
  createCompilerSession,
  parseExactCompilerManifest,
  resolveExactArtifactImport,
  transformSource,
  type ExactCompilerManifest,
  type ExactAssetRule,
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
import type { ExactPreparedCompilerRegistry } from "@exact/plugin-api";
import {
  invalidateExactPluginRegistry,
  prepareExactPluginRegistry,
  type ExactPreparedPluginRegistry
} from "@exact/plugin-host/node";

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
  applicationRoot?: string;
  configPath?: string;
  pluginRegistry?: ExactPreparedCompilerRegistry;
  assetRules?: readonly ExactAssetRule[];
  diagnostics?: boolean;
};

type FilterPattern = string | RegExp | readonly (string | RegExp)[];

export type ExactPlugin = {
  name: string;
  enforce: "pre";
  warn?(message: string): void;
  config?(): { resolve: { conditions: string[]; alias?: Array<{ find: RegExp; replacement: string }> } };
  configResolved?(config: { command: "build" | "serve" }): void;
  buildStart?(this: { addWatchFile(file: string): void; warn?(message: string): void }): void | Promise<void>;
  configureServer?(server: {
    httpServer?: { once(event: "close", listener: () => void): unknown };
    watcher?: { once(event: "close", listener: () => void): unknown };
  }): void;
  resolveId?(source: string, importer?: string): string | null;
  transform(this: { warn?(message: string): void }, code: string, id: string): { code: string; map: unknown } | null;
  handleHotUpdate?(this: { warn?(message: string): void }, context: { file: string }): void;
  watchChange?(this: { warn?(message: string): void }, id: string, change: { event: "create" | "update" | "delete" }): void;
  closeBundle?(): void;
};

/** Creates the Vite plugin that transforms eXact JSX and resolves .exact facade imports. */
export function exact(options: ExactPluginOptions = {}): ExactPlugin {
  let diagnosticsEnabled = options.diagnostics ?? false;
  let compilerSession = createCompilerSession({ languageService: diagnosticsEnabled });
  const diagnosticReporter = createDiagnosticReporter();
  const configureDiagnostics = (enabled: boolean): void => {
    if (enabled === diagnosticsEnabled) return;
    compilerSession.dispose();
    diagnosticsEnabled = enabled;
    compilerSession = createCompilerSession({ languageService: enabled });
  };
  const compatibilityCwd = typeof options.reactCompatibility === "object" ? options.reactCompatibility.cwd : undefined;
  const reactCompatibility = resolveReactCompatibility(options.reactCompatibility, compatibilityCwd);
  const compatibilityEngine = reactCompatibility
    ? createReactCompatibilityBuildEngine(typeof options.reactCompatibility === "object"
      ? options.reactCompatibility
      : { cwd: compatibilityCwd, target: reactCompatibility.target })
    : undefined;
  let preparedRegistry: ExactPreparedPluginRegistry | undefined;
  const prepareRegistry = async (): Promise<ExactPreparedPluginRegistry> => {
    if (preparedRegistry) return preparedRegistry;
    preparedRegistry = await prepareExactPluginRegistry({
      applicationRoot: options.applicationRoot,
      configPath: options.configPath,
      hostMode: "compiler"
    });
    return preparedRegistry;
  };
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
    configResolved(config) {
      configureDiagnostics(options.diagnostics ?? config.command === "serve");
    },
    async buildStart() {
      for (const file of compatibilityEngine?.watchFiles ?? []) this.addWatchFile(file);
      const registry = await prepareRegistry();
      for (const file of registry.watchFiles) this.addWatchFile(file);
      for (const warning of registry.warnings) this.warn?.(warning);
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
      if (options.diagnostics === undefined) configureDiagnostics(true);
      compatibilityEngine?.invalidate(context.file);
      if (preparedRegistry?.watchFiles.includes(path.resolve(context.file))) {
        invalidateExactPluginRegistry(preparedRegistry.applicationRoot);
        preparedRegistry = undefined;
      }
      // Semantic changes can originate in imported .ts/.d.ts files or the
      // project config even when that file itself contains no JSX.
      if (/(?:^|[\\/])tsconfig(?:\.[^\\/]+)?\.json$/i.test(context.file)) compilerSession.clear();
      else diagnosticReporter(compilerSession.invalidate(context.file), message => this.warn?.(message));
    },
    watchChange(id, change) {
      if (options.diagnostics === undefined) configureDiagnostics(true);
      compatibilityEngine?.invalidate(id);
      if (preparedRegistry?.watchFiles.includes(path.resolve(id))) {
        invalidateExactPluginRegistry(preparedRegistry.applicationRoot);
        preparedRegistry = undefined;
      }
      if (/(?:^|[\\/])tsconfig(?:\.[^\\/]+)?\.json$/i.test(id)) compilerSession.clear();
      else diagnosticReporter(compilerSession.invalidate(id, change.event === "delete"), message => this.warn?.(message));
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
        if (shouldCompileExactModule(id, code, options, options.pluginRegistry ?? preparedRegistry?.compiler)) {
          const result = transformSource(code, {
            filename: id,
            session: compilerSession,
            target: targetFor(options),
            importedManifests: importedManifestsFor(options),
            serverComponents: options.serverComponents,
            sourceMap: false,
            assetRules: options.assetRules,
            preserveClientAssetImports: true,
            pluginRegistry: options.pluginRegistry ?? preparedRegistry?.compiler
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

function createDiagnosticReporter(): (
  update: Readonly<{ affectedFiles: readonly string[]; diagnostics: readonly DiagnosticLike[] }>,
  warn: (message: string) => void
) => void {
  const previous = new Map<string, Set<string>>();
  return (update, warn) => {
    const next = new Map<string, Set<string>>();
    for (const diagnostic of update.diagnostics) {
      const file = diagnostic.filename ?? "<project>";
      let keys = next.get(file);
      if (!keys) next.set(file, keys = new Set());
      const key = diagnosticKey(diagnostic);
      keys.add(key);
      if (!previous.get(file)?.has(key)) warn(formatDiagnostic(diagnostic));
    }
    for (const file of update.affectedFiles) previous.delete(file.replaceAll("\\", "/"));
    for (const [file, keys] of next) previous.set(file, keys);
  };
}

type DiagnosticLike = Readonly<{
  code: string;
  message: string;
  filename?: string;
  span?: Readonly<{ line: number; column: number }>;
}>;

function diagnosticKey(diagnostic: DiagnosticLike): string {
  return `${diagnostic.code}:${diagnostic.span?.line}:${diagnostic.span?.column}:${diagnostic.message}`;
}

function formatDiagnostic(diagnostic: DiagnosticLike): string {
  const location = diagnostic.filename
    ? `${diagnostic.filename}${diagnostic.span ? `:${diagnostic.span.line}:${diagnostic.span.column}` : ""}`
    : "TypeScript";
  return `${location} - ${diagnostic.code}: ${diagnostic.message}`;
}

function targetFor(options: ExactPluginOptions): "client" | "server" {
  return options.target === "server" ? "server" : "client";
}

function importedManifestsFor(options: { importedManifests?: readonly ExactCompilerManifest[]; manifestFiles?: readonly string[] }): ExactCompilerManifest[] {
  return [
    ...(options.importedManifests ?? []),
    ...(options.manifestFiles ?? []).map(file => parseExactCompilerManifest(JSON.parse(readFileSync(file, "utf8")), file))
  ];
}

function shouldCompileExactModule(
  id: string,
  code: string,
  options: ExactPluginOptions,
  registry: ExactPreparedCompilerRegistry | undefined
): boolean {
  if (!options.include && /(?:^|[\\/])node_modules(?:[\\/]|$)/.test(id)) return false;
  if (options.include && !matchesFilter(id, options.include)) return false;
  if (options.exclude && matchesFilter(id, options.exclude)) return false;
  return containsJsx(id, code)
    || /@exact\s+[A-Za-z_$][\w$-]*\.[A-Za-z_$][\w$-]*/.test(code)
    || Object.values(registry?.plugins ?? {}).some(plugin => {
      const include = plugin.extension?.include;
      if (!include) return false;
      include.lastIndex = 0;
      return include.test(id);
    });
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
