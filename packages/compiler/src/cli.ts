#!/usr/bin/env node
import { compileProject } from "./index.js";

type CliOptions = {
  inputs: string[];
  outDir?: string;
  rootDir?: string;
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
    rootDir: options.rootDir
  });

  if (!options.outDir && results.length > 1) {
    throw new Error("exactc requires --outDir when compiling more than one file");
  }

  for (const result of results) {
    if (result.outputFile) {
      console.log(`${result.inputFile} -> ${result.outputFile}`);
    } else {
      process.stdout.write(result.code);
    }
  }
}

function parseArgs(argv: string[]): CliOptions {
  const inputs: string[] = [];
  let outDir: string | undefined;
  let rootDir: string | undefined;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--outDir") {
      outDir = argv[++index];
    } else if (arg === "--rootDir") {
      rootDir = argv[++index];
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      inputs.push(arg);
    }
  }

  return { inputs, outDir, rootDir };
}

function printUsage(): void {
  console.log("Usage: exactc [--outDir dir] [--rootDir dir] <file-or-directory...>");
}

main(process.argv.slice(2)).catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
