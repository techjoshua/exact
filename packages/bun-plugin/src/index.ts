import {
  exactExportConditions,
  clearExpressionProjectCache,
  invalidateExpressionModule,
  parseExactCompilerManifest,
  resolveExactArtifactImport,
  transformSource,
  type ExactCompilerManifest,
  type TransformTarget
} from "@exact/compiler";
import { readFileSync } from "node:fs";

export type ExactBunPluginOptions = {
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

export type BunBuildLike = {
  config?: {
    conditions?: string[];
  };
  onResolve(options: { filter: RegExp }, handler: (args: BunResolveArgs) => BunResolveResult | Promise<BunResolveResult>): void;
  onLoad(options: { filter: RegExp }, handler: (args: BunLoadArgs) => BunLoadResult | Promise<BunLoadResult>): void;
  onStart?(handler: () => void | Promise<void>): void;
};

export type BunResolveArgs = {
  path: string;
  importer?: string;
};

export type BunResolveResult = {
  path?: string;
  external?: boolean;
};

export type BunLoadArgs = {
  path: string;
  text?(): Promise<string>;
};

export type BunLoadResult = {
  contents?: string;
  loader?: "js" | "jsx" | "ts" | "tsx";
  sourcemap?: unknown;
};

export type BunPluginLike = {
  name: string;
  setup(build: BunBuildLike): void;
};

/** Creates the Bun plugin that transforms eXact JSX and resolves .exact facade imports. */
export function exact(options: ExactBunPluginOptions = {}): BunPluginLike {
  return {
    name: "exact",
    setup(build) {
      build.config ??= {};
      build.config.conditions = mergeConditions(build.config.conditions ?? [], exactExportConditions(targetFor(options), options));
      // A new Bun build may have been triggered by tsconfig or another file
      // outside the module graph. Recreate project configuration before loads.
      build.onStart?.(() => clearExpressionProjectCache());
      build.onResolve({ filter: /\.exact$/ }, args => {
        const resolved = resolveExactArtifactImport(args.path, args.importer, targetFor(options));
        return resolved ? { path: resolved.id } : {};
      });
      // Bun does not expose Vite's changed-file HMR hook. Observe every loaded
      // TypeScript/JavaScript dependency so non-JSX type and export changes
      // invalidate their transitive expression consumers before compilation.
      build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async args => {
        invalidateExpressionModule(args.path);
        const source = await readBunLoadSource(args);
        const result = transformExactBunSource(source, args.path, options);
        if (!result) return {};
        return {
          contents: result.code,
          loader: args.path.endsWith(".tsx") ? "tsx" : "jsx",
          ...(result.map ? { sourcemap: result.map } : {})
        };
      });
    }
  };
}

async function readBunLoadSource(args: BunLoadArgs): Promise<string> {
  if (args.text) return args.text();
  const runtime = globalThis as typeof globalThis & {
    Bun?: {
      file(path: string): { text(): Promise<string> };
    };
  };
  if (!runtime.Bun) throw new Error("Bun runtime is required to load files through @exact/bun-plugin");
  return runtime.Bun.file(args.path).text();
}

/** Transforms one Bun-loaded source file when it matches eXact plugin filters. */
export function transformExactBunSource(source: string, filename: string, options: ExactBunPluginOptions = {}): { code: string; map: unknown } | null {
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

/** Resolves a Bun import request for a .exact facade to a target artifact. */
export function resolveExactBunRequest(request: string, importer: string | undefined, options: ExactBunPluginOptions = {}): string | null {
  return resolveExactArtifactImport(request, importer, targetFor(options))?.id ?? null;
}

/** Prepends eXact export conditions without duplicating existing conditions. */
export function mergeConditions(current: readonly string[], next: readonly string[]): string[] {
  return [...next, ...current.filter(condition => !next.includes(condition))];
}

function targetFor(options: ExactBunPluginOptions): "client" | "server" {
  return options.target === "server" ? "server" : "client";
}

function shouldTransform(id: string, code: string, options: ExactBunPluginOptions): boolean {
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
