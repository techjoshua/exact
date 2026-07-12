import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { ExactCompilerManifest, ExactArtifactPlanEntry } from "./types.js";

export async function collectInputFiles(inputs: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  for (const input of inputs) {
    files.push(...await collectInput(input));
  }
  return files.sort();
}

export function isTransformablePath(file: string): boolean {
  return /\.[jt]sx$/i.test(file);
}

export function outputPathFor(inputFile: string, outDir: string, rootDir?: string): string {
  const root = rootDir ?? path.dirname(inputFile);
  const relative = path.relative(root, inputFile);
  return path.join(outDir, relative).replace(/\.(tsx|jsx)$/i, (_match, ext: string) => ext.toLowerCase() === "tsx" ? ".ts" : ".js");
}

export function manifestPathFor(outputFile: string): string {
  return outputFile.replace(/\.[^.\\/]+$/i, ".exact.json");
}

export function artifactPathsFor(inputFile: string, outDir: string, rootDir?: string): {
  clientFile: string;
  serverFile: string;
  manifestFile: string;
} {
  const root = rootDir ?? path.dirname(inputFile);
  const relative = path.relative(root, inputFile);
  const parsed = path.parse(relative);
  const extension = parsed.ext.toLowerCase() === ".tsx" ? ".ts" : ".js";
  const base = path.join(outDir, parsed.dir, parsed.name);
  return {
    clientFile: `${base}.exact.client${extension}`,
    serverFile: `${base}.exact.server${extension}`,
    manifestFile: `${base}.exact.manifest.json`
  };
}

export function withArtifactMetadata(
  manifest: ExactCompilerManifest,
  inputFile: string,
  paths: { clientFile: string; serverFile: string; manifestFile: string }
): ExactCompilerManifest {
  const root = path.dirname(paths.manifestFile);
  return {
    ...manifest,
    artifacts: {
      source: slashPath(path.relative(root, inputFile)),
      client: slashPath(path.relative(root, paths.clientFile)),
      server: slashPath(path.relative(root, paths.serverFile)),
      manifest: slashPath(path.relative(root, paths.manifestFile)),
      exports: manifest.exports,
      symbols: manifest.symbols,
      boundaries: manifest.boundaries
    }
  };
}

export function packageExportSpecifier(inputFile: string, sourceRoot: string): string {
  const relative = slashPath(path.relative(sourceRoot, inputFile)).replace(/\.[jt]sx$/i, "");
  return relative ? `./${relative}` : ".";
}

export function packageExportTarget(file: string, packageRoot: string): string {
  return `./${slashPath(path.relative(packageRoot, file))}`;
}

export function clientRegistryModulePath(file: string, rootDir: string): string {
  const relative = slashPath(path.relative(rootDir, file));
  if (relative.startsWith(".")) return relative;
  return `./${relative}`;
}

export function slashPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function commonRoot(files: readonly string[]): string {
  if (!files.length) return process.cwd();
  const split = files.map(file => path.dirname(path.resolve(file)).split(path.sep));
  const first = split[0]!;
  let index = 0;
  while (index < first.length && split.every(parts => parts[index] === first[index])) {
    index++;
  }
  return first.slice(0, index).join(path.sep) || path.parse(first[0] ?? process.cwd()).root;
}

export function sortPlanEntries(entries: ExactArtifactPlanEntry[]): ExactArtifactPlanEntry[] {
  return entries.sort((left, right) => left.inputFile.localeCompare(right.inputFile));
}

async function collectInput(input: string): Promise<string[]> {
  const fileStat = await stat(input);
  if (!fileStat.isDirectory()) return isTransformablePath(input) ? [input] : [];

  const files: string[] = [];
  for (const entry of await readdir(input, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const fullPath = path.join(input, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectInput(fullPath));
    } else if (isTransformablePath(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}
