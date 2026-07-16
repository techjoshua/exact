#!/usr/bin/env node
import path from "node:path";
import { createReactCompatibilityBuildEngine } from "@exact/react-compat/build";
import { validateReactCompatAdapterPackage } from "@exact/react-compat/plugin";

function main(argv: string[]): void {
  const command = argv[0];
  const root = path.resolve(argv[1] ?? process.cwd());
  if (command === "validate") {
    const registry = validateReactCompatAdapterPackage(root);
    console.log(`Valid React compatibility adapter: ${registry.adapters.join(", ")}`);
    console.log(`${registry.replacements.size} substitution${registry.replacements.size === 1 ? "" : "s"}`);
    return;
  }
  if (command === "report") {
    const target = argv.includes("--react19") ? 19 : argv.includes("--react18") ? 18 : "auto";
    const report = createReactCompatibilityBuildEngine({ cwd: root, target }).report();
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log("Usage: exact-react-compat validate [adapter-root] | report [build-root] [--react18|--react19]");
  process.exitCode = 1;
}

try { main(process.argv.slice(2)); }
catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
