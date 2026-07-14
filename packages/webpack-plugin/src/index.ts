import {
  clearExpressionProjectCache,
  exactExportConditions,
  invalidateExpressionModule,
  parseExactCompilerManifest,
  resolveExactArtifactImport,
  transformSource,
  type ExactCompilerManifest,
  type TransformTarget
} from "@exact/compiler";
import { readFileSync } from "node:fs";
import path from "node:path";

export type ExactWebpackPluginOptions = {
  target?: TransformTarget;
  importedManifests?: readonly ExactCompilerManifest[];
  manifestFiles?: readonly string[];
  clientCondition?: string;
  serverCondition?: string;
  include?: FilterPattern;
  exclude?: FilterPattern;
  serverComponents?: boolean;
  sourceMap?: boolean;
};

type FilterPattern = string | RegExp | readonly (string | RegExp)[];

export type WebpackResolverLike = {
  hooks?: {
    resolve?: {
      tapAsync?(name: string, handler: (request: WebpackResolveRequest, context: unknown, callback: WebpackResolveCallback) => void): void;
    };
  };
  ensureHook?(name: string): unknown;
  getHook?(name: string): {
    tapAsync?(name: string, handler: (request: WebpackResolveRequest, context: unknown, callback: WebpackResolveCallback) => void): void;
  };
  doResolve?(hook: unknown, request: WebpackResolveRequest, message: string, context: unknown, callback: WebpackResolveCallback): void;
};

export type WebpackCompilerLike = {
  options: {
    resolve?: {
      conditionNames?: string[];
    };
    module?: {
      rules?: unknown[];
    };
  };
  hooks?: {
    watchRun?: {
      tap?(name: string, handler: (compiler: WebpackCompilerLike & { modifiedFiles?: Iterable<string>; removedFiles?: Iterable<string> }) => void): void;
    };
    normalModuleFactory?: {
      tap?(name: string, handler: (factory: { hooks?: { resolver?: { tap?(name: string, resolver: (resolver: WebpackResolverLike) => WebpackResolverLike): void } } }) => void): void;
    };
  };
};

export type WebpackResolveRequest = {
  request?: string;
  path?: string;
};

export type WebpackResolveCallback = (error?: Error | null, result?: unknown) => void;

export class ExactWebpackPlugin {
  readonly options: ExactWebpackPluginOptions;

  constructor(options: ExactWebpackPluginOptions = {}) {
    this.options = options;
  }

  apply(compiler: WebpackCompilerLike): void {
    addWebpackConditions(compiler, exactExportConditions(targetFor(this.options), this.options));
    compiler.options.module ??= {};
    compiler.options.module.rules ??= [];
    compiler.options.module.rules.push(createExactWebpackRule(this.options));
    compiler.hooks?.watchRun?.tap?.("ExactWebpackPlugin", current => {
      const modified = [...(current.modifiedFiles ?? [])];
      const removed = new Set(current.removedFiles ?? []);
      if (modified.some(file => /(?:^|[\\/])tsconfig(?:\.[^\\/]+)?\.json$/i.test(file))) {
        clearExpressionProjectCache();
        return;
      }
      for (const file of modified) invalidateExpressionModule(file, removed.has(file));
      for (const file of removed) if (!modified.includes(file)) invalidateExpressionModule(file, true);
    });
    compiler.hooks?.normalModuleFactory?.tap?.("ExactWebpackPlugin", factory => {
      factory.hooks?.resolver?.tap?.("ExactWebpackPlugin", resolver => applyExactWebpackResolver(resolver, this.options));
    });
  }
}

/** Creates the webpack pre-loader rule for eXact JSX transforms. */
export function createExactWebpackRule(options: ExactWebpackPluginOptions = {}): Record<string, unknown> {
  return {
    test: /\.[jt]sx$/,
    enforce: "pre",
    use: [{
      loader: "@exact/webpack-plugin/loader",
      options
    }]
  };
}

/** Transforms one webpack-loaded source file when it matches eXact plugin filters. */
export function transformExactWebpackSource(source: string, filename: string, options: ExactWebpackPluginOptions = {}): { code: string; map: unknown } | null {
  if (!shouldTransform(filename, source, options)) return null;
  try {
    const result = transformSource(source, {
      filename,
      target: options.target,
      importedManifests: importedManifestsFor(options),
      serverComponents: options.serverComponents,
      sourceMap: options.sourceMap ?? true
    });
    return {
      code: result.code,
      map: result.map
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`eXact JSX transform failed for ${filename}\n${message}`);
  }
}

function importedManifestsFor(options: { importedManifests?: readonly ExactCompilerManifest[]; manifestFiles?: readonly string[] }): ExactCompilerManifest[] {
  return [
    ...(options.importedManifests ?? []),
    ...(options.manifestFiles ?? []).map(file => parseExactCompilerManifest(JSON.parse(readFileSync(file, "utf8")), file))
  ];
}

/** Resolves a webpack import request for a .exact facade to a target artifact. */
export function resolveExactWebpackRequest(request: string, importer: string | undefined, options: ExactWebpackPluginOptions = {}): string | null {
  return resolveExactArtifactImport(request, importer, targetFor(options))?.id ?? null;
}

/** Installs .exact facade resolution into a webpack resolver. */
export function applyExactWebpackResolver(resolver: WebpackResolverLike, options: ExactWebpackPluginOptions = {}): WebpackResolverLike {
  const resolveHook = resolver.getHook?.("resolve") ?? resolver.hooks?.resolve;
  const targetHook = resolver.ensureHook?.("resolved") ?? resolveHook;
  resolveHook?.tapAsync?.("ExactWebpackPlugin", (request, context, callback) => {
    if (!request.request) {
      callback();
      return;
    }
    const importer = request.path ? path.join(request.path, "__exact_importer.ts") : undefined;
    const resolved = resolveExactWebpackRequest(request.request, importer, options);
    if (!resolved) {
      callback();
      return;
    }
    const nextRequest = {
      ...request,
      request: resolved
    };
    if (resolver.doResolve && targetHook) {
      resolver.doResolve(targetHook, nextRequest, "resolved eXact target artifact", context, callback);
      return;
    }
    callback(null, nextRequest);
  });
  return resolver;
}

/** Prepends eXact export conditions to webpack's conditionNames list. */
export function addWebpackConditions(compiler: WebpackCompilerLike, conditions: readonly string[]): void {
  compiler.options.resolve ??= {};
  const current = compiler.options.resolve.conditionNames ?? [];
  compiler.options.resolve.conditionNames = [...conditions, ...current.filter(condition => !conditions.includes(condition))];
}

function targetFor(options: ExactWebpackPluginOptions): "client" | "server" {
  return options.target === "server" ? "server" : "client";
}

function shouldTransform(id: string, code: string, options: ExactWebpackPluginOptions): boolean {
  if (!/\.[jt]sx(?:$|\?)/.test(id)) return false;
  if (!code.includes("<")) return false;
  if (!options.include && /(?:^|[\\/])node_modules(?:[\\/]|$)/.test(id)) return false;
  if (options.include && !matchesFilter(id, options.include)) return false;
  if (options.exclude && matchesFilter(id, options.exclude)) return false;
  return true;
}

function matchesFilter(id: string, pattern: FilterPattern): boolean {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  return patterns.some(item => typeof item === "string" ? id.includes(item) : item.test(id));
}
