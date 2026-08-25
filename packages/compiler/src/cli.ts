#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { compileProjectArtifacts } from './compilation/compiler.js';
import { compileProject } from './compilation/file-compilation.js';
import { createCompilerSession } from './expression/session.js';
import { resolveNativeCompilerExecutable } from './native/executable.js';
import type { TransformTarget } from './types.js';

type CliOptions = {
	inputs: string[];
	outDir?: string;
	rootDir?: string;
	target?: TransformTarget;
	artifacts?: boolean;
	serverComponents?: boolean;
	sourceMap?: boolean;
	check?: boolean;
	project?: string;
};

async function main(argv: string[]): Promise<void> {
	const options = parseArgs(argv);
	if (!options.inputs.length) {
		printUsage();
		process.exitCode = 1;
		return;
	}
	const session = createCompilerSession({
		nativeCompiler: { executable: resolveNativeCompilerExecutable() }
	});

	try {
		if (options.check) {
			const configFile = checkConfigFile(options.project);
			await compileProject(options.inputs, {
				rootDir: options.rootDir,
				root: configFile ? path.dirname(configFile) : process.cwd(),
				configFile,
				target: options.target,
				serverComponents: options.serverComponents,
				generatedValidation: 'semantic',
				includeAllModules: true,
				session
			});
			return;
		}
		if (options.artifacts) {
			if (!options.outDir) throw new Error('exactc --artifacts requires --outDir');
			const results = await compileProjectArtifacts(options.inputs, {
				outDir: options.outDir,
				rootDir: options.rootDir,
				serverComponents: options.serverComponents,
				sourceMap: options.sourceMap,
				session
			});
			for (const result of results) {
				console.log(`${result.inputFile} -> ${result.clientFile}`);
				if (result.clientMapFile) console.log(`${result.inputFile} -> ${result.clientMapFile}`);
				console.log(`${result.inputFile} -> ${result.serverFile}`);
				if (result.serverMapFile) console.log(`${result.inputFile} -> ${result.serverMapFile}`);
			}
			return;
		}

		const results = await compileProject(options.inputs, {
			outDir: options.outDir,
			rootDir: options.rootDir,
			target: options.target,
			serverComponents: options.serverComponents,
			sourceMap: options.sourceMap,
			session
		});

		if (!options.outDir && results.length > 1) {
			throw new Error('exactc requires --outDir when compiling more than one file');
		}

		for (const result of results) {
			if (result.outputFile) {
				console.log(`${result.inputFile} -> ${result.outputFile}`);
				if (result.sourceMapFile) {
					console.log(`${result.inputFile} -> ${result.sourceMapFile}`);
				}
			} else {
				process.stdout.write(result.code);
			}
		}
	} finally {
		session.dispose();
	}
}

function parseArgs(argv: string[]): CliOptions {
	const inputs: string[] = [];
	let outDir: string | undefined;
	let rootDir: string | undefined;
	let target: TransformTarget | undefined;
	let artifacts = false;
	let serverComponents = false;
	let sourceMap = false;
	let check = false;
	let project: string | undefined;
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index]!;
		if (arg === '--outDir') {
			outDir = argv[++index];
		} else if (arg === '--rootDir') {
			rootDir = argv[++index];
		} else if (arg === '--target') {
			target = parseTarget(argv[++index]);
		} else if (arg === '--artifacts') {
			artifacts = true;
		} else if (arg === '--serverComponents') {
			serverComponents = true;
		} else if (arg === '--sourceMap') {
			sourceMap = true;
		} else if (arg === '--check') {
			check = true;
		} else if (arg === '--project') {
			project = argv[++index];
		} else if (arg === '--help' || arg === '-h') {
			printUsage();
			process.exit(0);
		} else {
			inputs.push(arg);
		}
	}

	return {
		inputs,
		outDir,
		rootDir,
		target,
		artifacts,
		serverComponents,
		sourceMap,
		check,
		project
	};
}

function printUsage(): void {
	console.log(
		'Usage: exactc [--check] [--project tsconfig.json] [--outDir dir] [--rootDir dir] [--target client|server] [--artifacts] [--serverComponents] [--sourceMap] <file-or-directory...>'
	);
}

function checkConfigFile(configFile: string | undefined): string | undefined {
	if (configFile) return path.resolve(configFile);
	const conventional = path.resolve('tsconfig.json');
	return existsSync(conventional) ? conventional : undefined;
}

function parseTarget(value: string | undefined): TransformTarget {
	if (value === 'client' || value === 'server') return value;
	throw new Error(`Invalid --target ${value ?? ''}`);
}

main(process.argv.slice(2)).catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
