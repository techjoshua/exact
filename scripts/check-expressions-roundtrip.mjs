import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createExpressionProject } from "../packages/expressions/dist/index.js";

const root = path.resolve(import.meta.dirname, "..");
const files = await collectSources(root);
const groups = new Map();
for (const filename of files) {
  const config = nearestConfig(path.dirname(filename));
  if (!config) throw new Error(`No tsconfig.json found for ${filename}`);
  const group = groups.get(config) ?? [];
  group.push(filename);
  groups.set(config, group);
}

let checked = 0;
for (const [config, filenames] of groups) {
  const project = createExpressionProject({ tsconfigPath: config });
  const entries = await Promise.all(filenames.map(async filename => [filename, await readFile(filename, "utf8")]));
  const modules = project.updateModules(entries);
  for (const [filename, source] of entries) {
    const module = modules.get(normalize(filename));
    if (!module) throw new Error(`Expression project omitted ${filename}`);
    if (module.emit({ format: "preserve" }).code !== source) throw new Error(`Lossless round trip changed ${filename}`);
    checked++;
  }
}

console.log(`@exact/expressions losslessly round-tripped ${checked} source files across ${groups.size} projects`);

async function collectSources(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git" || entry.name === ".tmp") continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await collectSources(filename));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) output.push(filename);
  }
  return output;
}

function nearestConfig(directory) {
  let cursor = directory;
  while (cursor.startsWith(root)) {
    const candidate = path.join(cursor, "tsconfig.json");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return undefined;
}

function normalize(filename) {
  return path.resolve(filename).replace(/\\/g, "/");
}
