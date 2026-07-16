#!/usr/bin/env node
import { syncExactPluginTypes } from "./registry.js";

const args = process.argv.slice(2);

async function main(): Promise<void> {
  if (args[0] !== "plugins" || args[1] !== "sync") {
    throw new Error("Usage: exact plugins sync [application-root]");
  }
  const file = await syncExactPluginTypes({ applicationRoot: args[2] });
  process.stdout.write(`${file}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
