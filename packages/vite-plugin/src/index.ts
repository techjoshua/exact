import { transformSource, type TransformTarget } from "@exact/compiler";

export type ExactPluginOptions = {
  include?: FilterPattern;
  exclude?: FilterPattern;
  target?: TransformTarget;
};

type FilterPattern = string | RegExp | readonly (string | RegExp)[];

export type ExactPlugin = {
  name: string;
  enforce: "pre";
  transform(code: string, id: string): { code: string; map: null } | null;
};

export function exact(options: ExactPluginOptions = {}): ExactPlugin {
  return {
    name: "exact",
    enforce: "pre",
    transform(code, id) {
      if (!shouldTransform(id, code, options)) return null;
      try {
        return {
          code: transformSource(code, { filename: id, target: options.target }).code,
          map: null
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`eXact JSX transform failed for ${id}\n${message}`);
      }
    }
  };
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
