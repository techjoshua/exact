#!/usr/bin/env node
import { compileProject, compileProjectArtifacts, type TransformTarget } from '@exactjs/compiler';
import { createReactCompatibilityBuildEngine } from '@exactjs/react-compat/build';
import type { ReactCompatibilityTarget } from '@exactjs/react-compat/plugin';

type CliOptions = {
	inputs: string[];
	outDir?: string;
	rootDir?: string;
	target?: TransformTarget;
	emitManifest?: boolean;
	artifacts?: boolean;
	serverComponents?: boolean;
	sourceMap?: boolean;
	compatibilityRoot?: string;
	reactTarget?: ReactCompatibilityTarget;
};

async function main(argv: string[]): Promise<void> {
	const options = parseArgs(argv);
	if (!options.inputs.length) {
		printUsage();
		process.exitCode = 1;
		return;
	}
	const engine = createReactCompatibilityBuildEngine({
		cwd: options.compatibilityRoot ?? process.cwd(),
		target: options.reactTarget ?? 'auto'
	});
	const transformModule = (
		input: Readonly<{ id: string; source: string; target: TransformTarget }>
	) => {
		const result = engine.transformModule({
			id: input.id,
			source: input.source,
			format: 'module',
			target: input.target === 'server' ? 'server' : 'client',
			sourceMap: false
		});
		for (const diagnostic of result.diagnostics)
			if (diagnostic.severity === 'warning')
				console.error(`[${diagnostic.code}] ${diagnostic.message} (${diagnostic.moduleId})`);
		return result;
	};
	if (options.artifacts) {
		if (!options.outDir) throw new Error('exact-reactc --artifacts requires --outDir');
		const results = await compileProjectArtifacts(options.inputs, {
			outDir: options.outDir,
			rootDir: options.rootDir,
			serverComponents: options.serverComponents,
			sourceMap: options.sourceMap,
			jsxInterop: engine.jsxInterop,
			moduleTransform: transformModule
		});
		for (const result of results) {
			console.log(`${result.inputFile} -> ${result.clientFile}`);
			console.log(`${result.inputFile} -> ${result.serverFile}`);
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
		jsxInterop: engine.jsxInterop,
		moduleTransform: transformModule
	});
	if (!options.outDir && results.length > 1)
		throw new Error('exact-reactc requires --outDir when compiling more than one file');
	for (const result of results) {
		if (result.outputFile) console.log(`${result.inputFile} -> ${result.outputFile}`);
		else process.stdout.write(result.code);
	}
}

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = { inputs: [] };
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index]!;
		if (arg === '--outDir') options.outDir = requiredValue(argv, ++index, arg);
		else if (arg === '--rootDir') options.rootDir = requiredValue(argv, ++index, arg);
		else if (arg === '--target') options.target = parseTarget(requiredValue(argv, ++index, arg));
		else if (arg === '--compatibilityRoot')
			options.compatibilityRoot = requiredValue(argv, ++index, arg);
		else if (arg === '--reactTarget')
			options.reactTarget = parseReactTarget(requiredValue(argv, ++index, arg));
		else if (arg === '--manifest') options.emitManifest = true;
		else if (arg === '--artifacts') options.artifacts = true;
		else if (arg === '--serverComponents') options.serverComponents = true;
		else if (arg === '--sourceMap') options.sourceMap = true;
		else if (arg === '--help' || arg === '-h') {
			printUsage();
			process.exit(0);
		} else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}`);
		else options.inputs.push(arg);
	}
	return options;
}

function requiredValue(argv: string[], index: number, option: string): string {
	const value = argv[index];
	if (!value || value.startsWith('-')) throw new Error(`${option} requires a value`);
	return value;
}

function parseTarget(value: string): TransformTarget {
	if (value === 'default' || value === 'client' || value === 'server') return value;
	throw new Error(`Invalid --target ${value}`);
}

function parseReactTarget(value: string): ReactCompatibilityTarget {
	if (value === 'auto' || value === '18' || value === '19') return value;
	throw new Error(`Invalid --reactTarget ${value}`);
}

function printUsage(): void {
	console.log(
		'Usage: exact-reactc [exactc options] [--compatibilityRoot dir] [--reactTarget auto|18|19] <file-or-directory...>'
	);
}

main(process.argv.slice(2)).catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
