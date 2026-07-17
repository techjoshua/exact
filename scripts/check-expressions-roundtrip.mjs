import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
if (process.argv[2] === "--group") {
  const input = await readStandardInput();
  const { config, filenames } = JSON.parse(input);
  await checkGroup(config, filenames);
} else {
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
    await runAdaptiveGroup(config, filenames);
    checked += filenames.length;
  }

  console.log(`@exact/expressions losslessly round-tripped ${checked} source files across ${groups.size} projects`);
}

async function checkGroup(config, filenames) {
  const { createExpressionProject } = await import("../packages/expressions/dist/index.js");
  const project = createExpressionProject({ tsconfigPath: config });
  try {
    const entries = await Promise.all(filenames.map(async filename => [filename, await readFile(filename, "utf8")]));
    const modules = project.updateModules(entries);
    for (const [filename, source] of entries) {
      const module = modules.get(normalize(filename));
      if (!module) throw new Error(`Expression project omitted ${filename}`);
      if (module.emit({ format: "preserve" }).code !== source) throw new Error(`Lossless round trip changed ${filename}`);
    }
  } finally {
    project.dispose();
  }
}

function runGroup(config, filenames) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [import.meta.filename, "--group"], {
      cwd: root,
      stdio: ["pipe", "ignore", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", code => code === 0
      ? resolve()
      : reject(Object.assign(
        new Error(`Expression round-trip worker exited ${code} for ${config}${stderr ? `\n${stderr}` : ""}`),
        { exitCode: code }
      )));
    child.stdin.end(JSON.stringify({ config, filenames }));
  });
}

async function runAdaptiveGroup(config, filenames) {
  try {
    await runGroup(config, filenames);
  } catch (error) {
    if (filenames.length === 1) throw error;
    const middle = Math.ceil(filenames.length / 2);
    await runAdaptiveGroup(config, filenames.slice(0, middle));
    await runAdaptiveGroup(config, filenames.slice(middle));
  }
}

async function readStandardInput() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

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
