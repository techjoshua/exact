#!/usr/bin/env node
import { compileProject } from "./index.js";
import type { TransformTarget } from "./index.js";

type CliOptions = {
  inputs: string[];
  outDir?: string;
  rootDir?: string;
  target?: TransformTarget;
  emitManifest?: boolean;
};

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  if (!options.inputs.length) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const results = await compileProject(options.inputs, {
    outDir: options.outDir,
    rootDir: options.rootDir,
    target: options.target,
    emitManifest: options.emitManifest
  });

  if (!options.outDir && results.length > 1) {
    throw new Error("exactc requires --outDir when compiling more than one file");
  }

  for (const result of results) {
    if (result.outputFile) {
      console.log(`${result.inputFile} -> ${result.outputFile}`);
      if (result.manifestFile) {
        console.log(`${result.inputFile} -> ${result.manifestFile}`);
      }
    } else {
      process.stdout.write(result.code);
    }
  }
}

function parseArgs(argv: string[]): CliOptions {
  const inputs: string[] = [];
  let outDir: string | undefined;
  let rootDir: string | undefined;
  let target: TransformTarget | undefined;
  let emitManifest = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--outDir") {
      outDir = argv[++index];
    } else if (arg === "--rootDir") {
      rootDir = argv[++index];
    } else if (arg === "--target") {
      target = parseTarget(argv[++index]);
    } else if (arg === "--manifest") {
      emitManifest = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      inputs.push(arg);
    }
  }

  return { inputs, outDir, rootDir, target, emitManifest };
}

function printUsage(): void {
  console.log("Usage: exactc [--outDir dir] [--rootDir dir] [--target default|client|server] [--manifest] <file-or-directory...>");
}

function parseTarget(value: string | undefined): TransformTarget {
  if (value === "default" || value === "client" || value === "server") return value;
  throw new Error(`Invalid --target ${value ?? ""}`);
}

main(process.argv.slice(2)).catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
