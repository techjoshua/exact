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
};

type FilterPattern = string | RegExp | readonly (string | RegExp)[];

export type ExactPlugin = {
  name: string;
  enforce: "pre";
  config?(): { resolve: { conditions: string[] } };
  resolveId?(source: string, importer?: string): string | null;
  transform(code: string, id: string): { code: string; map: unknown } | null;
  handleHotUpdate?(context: { file: string }): void;
};

/** Creates the Vite plugin that transforms eXact JSX and resolves .exact facade imports. */
export function exact(options: ExactPluginOptions = {}): ExactPlugin {
  return {
    name: "exact",
    enforce: "pre",
    config() {
      return {
        resolve: {
          conditions: exactExportConditions(options.target === "server" ? "server" : "client", options)
        }
      };
    },
    resolveId(source, importer) {
      return resolveExactArtifactImport(source, importer, options.target === "server" ? "server" : "client")?.id ?? null;
    },
    handleHotUpdate(context) {
      // Semantic changes can originate in imported .ts/.d.ts files or the
      // project config even when that file itself contains no JSX.
      if (/(?:^|[\\/])tsconfig(?:\.[^\\/]+)?\.json$/i.test(context.file)) clearExpressionProjectCache();
      else invalidateExpressionModule(context.file);
    },
    transform(code, id) {
      if (!shouldTransform(id, code, options)) return null;
      try {
        const result = transformSource(code, {
          filename: id,
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

function shouldTransform(id: string, code: string, options: ExactPluginOptions): boolean {
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
