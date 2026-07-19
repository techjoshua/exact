#!/usr/bin/env node
import { prepareExactPluginRegistry } from '@exact/plugin-host/node';
import path from 'node:path';
import { compileProject, compileProjectArtifacts } from './compilation/compiler.js';
import type { TransformTarget } from './types.js';

type CliOptions = {
	inputs: string[];
	outDir?: string;
	rootDir?: string;
	target?: TransformTarget;
	emitManifest?: boolean;
	artifacts?: boolean;
	serverComponents?: boolean;
	sourceMap?: boolean;
};

async function main(argv: string[]): Promise<void> {
	const options = parseArgs(argv);
	if (!options.inputs.length) {
		printUsage();
		process.exitCode = 1;
		return;
	}
	const pluginRegistry = await prepareCliRegistry(options);

	if (options.artifacts) {
		if (!options.outDir) throw new Error('exactc --artifacts requires --outDir');
		const results = await compileProjectArtifacts(options.inputs, {
			outDir: options.outDir,
			rootDir: options.rootDir,
			serverComponents: options.serverComponents,
			sourceMap: options.sourceMap,
			pluginRegistry
		});
		for (const result of results) {
			console.log(`${result.inputFile} -> ${result.clientFile}`);
			if (result.clientMapFile) console.log(`${result.inputFile} -> ${result.clientMapFile}`);
			console.log(`${result.inputFile} -> ${result.serverFile}`);
			if (result.serverMapFile) console.log(`${result.inputFile} -> ${result.serverMapFile}`);
			console.log(`${result.inputFile} -> ${result.manifestFile}`);
		}
		return;
	}

	const results = await compileProject(options.inputs, {
		outDir: options.outDir,
		rootDir: options.rootDir,
		target: options.target,
		emitManifest: options.emitManifest,
		serverComponents: options.serverComponents,
		sourceMap: options.sourceMap,
		pluginRegistry
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
			if (result.manifestFile) {
				console.log(`${result.inputFile} -> ${result.manifestFile}`);
			}
		} else {
			process.stdout.write(result.code);
		}
	}
}

async function prepareCliRegistry(options: CliOptions) {
	try {
		return (
			await prepareExactPluginRegistry({
				applicationRoot: options.rootDir ?? path.dirname(path.resolve(options.inputs[0]!)),
				hostMode: 'compiler'
			})
		).compiler;
	} catch (error) {
		if (error instanceof Error && /package\.json was not found above/.test(error.message))
			return undefined;
		throw error;
	}
}

function parseArgs(argv: string[]): CliOptions {
	const inputs: string[] = [];
	let outDir: string | undefined;
	let rootDir: string | undefined;
	let target: TransformTarget | undefined;
	let emitManifest = false;
	let artifacts = false;
	let serverComponents = false;
	let sourceMap = false;

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index]!;
		if (arg === '--outDir') {
			outDir = argv[++index];
		} else if (arg === '--rootDir') {
			rootDir = argv[++index];
		} else if (arg === '--target') {
			target = parseTarget(argv[++index]);
		} else if (arg === '--manifest') {
			emitManifest = true;
		} else if (arg === '--artifacts') {
			artifacts = true;
		} else if (arg === '--serverComponents') {
			serverComponents = true;
		} else if (arg === '--sourceMap') {
			sourceMap = true;
		} else if (arg === '--help' || arg === '-h') {
			printUsage();
			process.exit(0);
		} else {
			inputs.push(arg);
		}
	}

	return { inputs, outDir, rootDir, target, emitManifest, artifacts, serverComponents, sourceMap };
}

function printUsage(): void {
	console.log(
		'Usage: exactc [--outDir dir] [--rootDir dir] [--target default|client|server] [--manifest] [--artifacts] [--serverComponents] [--sourceMap] <file-or-directory...>'
	);
}

function parseTarget(value: string | undefined): TransformTarget {
	if (value === 'default' || value === 'client' || value === 'server') return value;
	throw new Error(`Invalid --target ${value ?? ''}`);
}

main(process.argv.slice(2)).catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
