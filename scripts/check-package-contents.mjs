import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const packagesDir = path.join(root, "packages");
const npmCommand = process.env.npm_execpath
  ? { file: process.execPath, args: [process.env.npm_execpath] }
  : { file: process.platform === "win32" ? "npm.cmd" : "npm", args: [] };
const cacheDir = path.join(root, ".tmp", "npm-cache");
const disallowedPath = /(^src\/|\.test\.|tsconfig|tsbuildinfo)/;

mkdirSync(cacheDir, { recursive: true });

let failed = false;

for (const directory of readdirSync(packagesDir)) {
  const packageJsonPath = path.join(packagesDir, directory, "package.json");
  if (!existsSync(packageJsonPath)) continue;

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (packageJson.private) continue;

  const output = execFileSync(npmCommand.file, [...npmCommand.args, "pack", "--dry-run", "--json", "-w", packageJson.name], {
    cwd: root,
    env: {
      ...process.env,
      npm_config_cache: cacheDir
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const [pack] = JSON.parse(output);
  const badFiles = pack.files
    .map(file => file.path)
    .filter(file => disallowedPath.test(file));

  if (badFiles.length > 0) {
    failed = true;
    console.error(`${packageJson.name} has disallowed package files:`);
    for (const file of badFiles) console.error(`  ${file}`);
    continue;
  }

  console.log(`${packageJson.name} package files ok (${pack.entryCount} entries)`);
}

if (failed) process.exit(1);
