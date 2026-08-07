import { existsSync, statSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import type { ExactConfig } from './contracts.js';

const configNames = Object.freeze([
	'exact.config.ts',
	'exact.config.mts',
	'exact.config.js',
	'exact.config.mjs',
	'exact.config.cjs'
]);

/** Result of loading the application's one neutral eXact configuration object. */
export type ExactLoadedConfig = Readonly<{
	config?: ExactConfig;
	configPath?: string;
	watchFiles: readonly string[];
}>;

/** Options for deterministic eXact configuration discovery and loading. */
export type LoadExactConfigOptions = Readonly<{
	applicationRoot: string;
	configPath?: string;
}>;

/**
 * Discovers and loads eXact configuration without preparing plugins or build adapters.
 * TypeScript temporary modules are removed before the returned promise settles.
 */
export async function loadExactConfig(options: LoadExactConfigOptions): Promise<ExactLoadedConfig> {
	const applicationRoot = path.resolve(options.applicationRoot);
	const configPath = options.configPath
		? path.resolve(applicationRoot, options.configPath)
		: findExactConfig(applicationRoot);
	if (!configPath) return Object.freeze({ watchFiles: Object.freeze([]) });
	if (!existsSync(configPath)) throw new Error(`eXact configuration not found: ${configPath}`);
	const config = await importExactConfig(configPath);
	return Object.freeze({
		config,
		configPath,
		watchFiles: Object.freeze([configPath])
	});
}

function findExactConfig(start: string): string | undefined {
	let directory = start;
	while (true) {
		for (const name of configNames) {
			const candidate = path.join(directory, name);
			if (existsSync(candidate)) return candidate;
		}
		const parent = path.dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

async function importExactConfig(configPath: string): Promise<ExactConfig> {
	let imported: Record<string, unknown>;
	if (/\.[cm]?ts$/i.test(configPath)) {
		const source = await readFile(configPath, 'utf8');
		const output = ts.transpileModule(source, {
			compilerOptions: {
				target: ts.ScriptTarget.ES2022,
				module: ts.ModuleKind.ESNext,
				moduleResolution: ts.ModuleResolutionKind.Bundler,
				verbatimModuleSyntax: true
			},
			fileName: configPath,
			reportDiagnostics: true
		});
		const errors =
			output.diagnostics?.filter(
				(diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
			) ?? [];
		if (errors.length) {
			throw new Error(
				`Unable to transpile ${configPath}: ${errors
					.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
					.join('\n')}`
			);
		}
		const temporary = path.join(
			path.dirname(configPath),
			`.exact-config-${process.pid}-${Date.now()}.mjs`
		);
		try {
			await writeFile(temporary, output.outputText, { flag: 'wx' });
			imported = await nativeImport(`${pathToFileURL(temporary).href}?t=${Date.now()}`);
		} finally {
			await rm(temporary, { force: true });
		}
	} else {
		imported = await nativeImport(
			`${pathToFileURL(configPath).href}?t=${statSync(configPath).mtimeMs}`
		);
	}
	const config = imported.default;
	if (!config || typeof config !== 'object' || Array.isArray(config))
		throw new Error(`${configPath} must default-export an eXact configuration object`);
	return config as ExactConfig;
}

async function nativeImport(specifier: string): Promise<Record<string, unknown>> {
	return import(
		/* @vite-ignore */
		/* webpackIgnore: true */
		specifier
	) as Promise<Record<string, unknown>>;
}
