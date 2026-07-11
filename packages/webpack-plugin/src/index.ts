import {
  exactExportConditions,
  resolveExactArtifactImport,
  transformSource,
  type TransformTarget
} from "@exact/compiler";

export type ExactWebpackPluginOptions = {
  target?: TransformTarget;
  clientCondition?: string;
  serverCondition?: string;
  include?: FilterPattern;
  exclude?: FilterPattern;
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
  }
}

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

export function transformExactWebpackSource(source: string, filename: string, options: ExactWebpackPluginOptions = {}): { code: string; map: null } | null {
  if (!shouldTransform(filename, source, options)) return null;
  return {
    code: transformSource(source, { filename, target: options.target }).code,
    map: null
  };
}

export function resolveExactWebpackRequest(request: string, importer: string | undefined, options: ExactWebpackPluginOptions = {}): string | null {
  return resolveExactArtifactImport(request, importer, targetFor(options))?.id ?? null;
}

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
