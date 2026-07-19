import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceRoots = [
  "packages",
  "framework-adapters",
  "react-adapters",
  "plugins",
  "component-libraries"
];
const violations = [];

for (const sourceRoot of sourceRoots) {
  for (const file of await sourceFiles(path.join(root, sourceRoot))) {
    const relative = path.relative(root, file).replaceAll("\\", "/");
    const source = await readFile(file, "utf8");

    // Importing a package façade from one of its implementation modules creates
    // a hidden cycle and makes later extraction substantially harder.
    const sourcePath = relative.split("/src/")[1] ?? "";
    if (
      sourcePath.includes("/")
      && !relative.endsWith("/index.ts")
      && !relative.endsWith("/index.tsx")
    ) {
      for (const match of source.matchAll(/from\s+["']\.\/index\.js["']/g)) {
        violations.push(`${relative}:${lineAt(source, match.index)} imports its package façade`);
      }
    }

    if (/(?:^|\/)src\/utils?\.(?:ts|tsx)$/.test(relative)) {
      violations.push(`${relative}: generic utility modules must be replaced by a domain-owned module`);
    }
  }
}

if (violations.length) {
  throw new Error(`Source architecture violations:\n${violations.join("\n")}`);
}

console.log("source architecture ok");

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name === "node_modules") continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(filename));
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name)) files.push(filename);
  }
  return files;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}
