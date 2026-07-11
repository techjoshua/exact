import {
  exactExportConditions,
  resolveExactArtifactImport,
  transformSource,
  type ExactCompilerManifest,
  type TransformTarget
} from "@exact/compiler";

export type ExactBunPluginOptions = {
  target?: TransformTarget;
  importedManifests?: readonly ExactCompilerManifest[];
  clientCondition?: string;
  serverCondition?: string;
  include?: FilterPattern;
  exclude?: FilterPattern;
};

type FilterPattern = string | RegExp | readonly (string | RegExp)[];

export type BunBuildLike = {
  config?: {
    conditions?: string[];
  };
  onResolve(options: { filter: RegExp }, handler: (args: BunResolveArgs) => BunResolveResult | Promise<BunResolveResult>): void;
  onLoad(options: { filter: RegExp }, handler: (args: BunLoadArgs) => BunLoadResult | Promise<BunLoadResult>): void;
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
};

export type BunPluginLike = {
  name: string;
  setup(build: BunBuildLike): void;
};

export function exact(options: ExactBunPluginOptions = {}): BunPluginLike {
  return {
    name: "exact",
    setup(build) {
      build.config ??= {};
      build.config.conditions = mergeConditions(build.config.conditions ?? [], exactExportConditions(targetFor(options), options));
      build.onResolve({ filter: /\.exact$/ }, args => {
        const resolved = resolveExactArtifactImport(args.path, args.importer, targetFor(options));
        return resolved ? { path: resolved.id } : {};
      });
      build.onLoad({ filter: /\.[jt]sx$/ }, async args => {
        const source = await readBunLoadSource(args);
        const result = transformExactBunSource(source, args.path, options);
        if (!result) return {};
        return {
          contents: result.code,
          loader: args.path.endsWith(".tsx") ? "tsx" : "jsx"
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

export function transformExactBunSource(source: string, filename: string, options: ExactBunPluginOptions = {}): { code: string; map: null } | null {
  if (!shouldTransform(filename, source, options)) return null;
  return {
    code: transformSource(source, { filename, target: options.target, importedManifests: options.importedManifests }).code,
    map: null
  };
}

export function resolveExactBunRequest(request: string, importer: string | undefined, options: ExactBunPluginOptions = {}): string | null {
  return resolveExactArtifactImport(request, importer, targetFor(options))?.id ?? null;
}

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
