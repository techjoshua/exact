import { existsSync, readFileSync, statSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import type { ExactConfig } from './contracts.js';
import type { ExactPackageEnhancementImport } from './contracts.js';
import { normalizeExactConfig } from './normalization.js';

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
	/** Attributed imports made package-wide by the owning configuration module. */
	packageEnhancements: readonly ExactPackageEnhancementImport[];
}>;

/** Options for deterministic eXact configuration discovery and loading. */
export type LoadExactConfigOptions = Readonly<{
	applicationRoot: string;
	configPath?: string;
}>;

/** Reads only static package enhancement declarations without executing configuration code. */
export function loadExactPackageEnhancements(options: LoadExactConfigOptions): Readonly<{
	configPath?: string;
	packageEnhancements: readonly ExactPackageEnhancementImport[];
}> {
	const applicationRoot = path.resolve(options.applicationRoot);
	const configPath = options.configPath
		? path.resolve(applicationRoot, options.configPath)
		: findExactConfig(applicationRoot);
	if (!configPath) return Object.freeze({ packageEnhancements: Object.freeze([]) });
	if (!existsSync(configPath)) throw new Error(`eXact configuration not found: ${configPath}`);
	return Object.freeze({
		configPath,
		packageEnhancements: extractPackageEnhancements(readFileSync(configPath, 'utf8'), configPath)
			.packageEnhancements
	});
}

/**
 * Discovers and loads eXact configuration without preparing plugins or build adapters.
 * TypeScript temporary modules are removed before the returned promise settles.
 */
export async function loadExactConfig(options: LoadExactConfigOptions): Promise<ExactLoadedConfig> {
	const applicationRoot = path.resolve(options.applicationRoot);
	const configPath = options.configPath
		? path.resolve(applicationRoot, options.configPath)
		: findExactConfig(applicationRoot);
	if (!configPath)
		return Object.freeze({
			watchFiles: Object.freeze([]),
			packageEnhancements: Object.freeze([])
		});
	if (!existsSync(configPath)) throw new Error(`eXact configuration not found: ${configPath}`);
	const loaded = await importExactConfig(configPath);
	return Object.freeze({
		config: loaded.config,
		configPath,
		watchFiles: Object.freeze([configPath]),
		packageEnhancements: loaded.packageEnhancements
	});
}

/** Finds the nearest eXact config without escaping an optional owning-workspace boundary. */
export function findExactConfig(start: string, boundary?: string): string | undefined {
	let directory = path.resolve(start);
	const limit = boundary === undefined ? undefined : path.resolve(boundary);
	if (limit !== undefined && !pathContains(limit, directory)) return undefined;
	while (true) {
		for (const name of configNames) {
			const candidate = path.join(directory, name);
			if (existsSync(candidate)) return candidate;
		}
		if (limit !== undefined && samePath(directory, limit)) return undefined;
		const parent = path.dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

function pathContains(parent: string, candidate: string): boolean {
	const relative = path.relative(parent, candidate);
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function samePath(left: string, right: string): boolean {
	return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

async function importExactConfig(configPath: string): Promise<
	Readonly<{
		config: ExactConfig;
		packageEnhancements: readonly ExactPackageEnhancementImport[];
	}>
> {
	let imported: Record<string, unknown>;
	const authored = await readFile(configPath, 'utf8');
	const declaration = extractPackageEnhancements(authored, configPath);
	if (/\.[cm]?ts$/i.test(configPath)) {
		const output = ts.transpileModule(declaration.executableSource, {
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
	} else if (declaration.packageEnhancements.length) {
		if (/\.cjs$/i.test(configPath))
			throw new Error('Package-scoped enhancement exports require an ESM exact configuration');
		const temporary = path.join(
			path.dirname(configPath),
			`.exact-config-${process.pid}-${Date.now()}.mjs`
		);
		try {
			await writeFile(temporary, declaration.executableSource, { flag: 'wx' });
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
	return Object.freeze({
		config: normalizeExactConfig(config as ExactConfig, configPath),
		packageEnhancements: declaration.packageEnhancements
	});
}

/**
 * Extracts package-scoped namespace exports while leaving line and character positions stable.
 * The executable configuration must never instantiate enhancement runtime modules.
 */
function extractPackageEnhancements(
	source: string,
	configPath: string
): Readonly<{
	executableSource: string;
	packageEnhancements: readonly ExactPackageEnhancementImport[];
}> {
	const sourceFile = ts.createSourceFile(
		configPath,
		source,
		ts.ScriptTarget.Latest,
		true,
		/\.[cm]?tsx?$/i.test(configPath) ? ts.ScriptKind.TS : ts.ScriptKind.JS
	);
	const registrations: ExactPackageEnhancementImport[] = [];
	const removals: Readonly<{ start: number; end: number }>[] = sourceFile.statements.flatMap(
		(statement) => {
			if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return [];
			const attributes = importAttributeValues(statement);
			if (attributes.type !== 'exact-enhancement' || attributes.scope !== 'package') return [];
			if (ts.isExportDeclaration(statement)) {
				if (
					statement.isTypeOnly ||
					!statement.moduleSpecifier ||
					!ts.isStringLiteral(statement.moduleSpecifier) ||
					!statement.exportClause ||
					!ts.isNamespaceExport(statement.exportClause)
				)
					throw new Error(
						`${configPath}: package-scoped enhancements require an attributed namespace export`
					);
				registrations.push({
					localName: statement.exportClause.name.text,
					moduleSpecifier: statement.moduleSpecifier.text,
					importKind: 'namespace',
					declaredIn: path.resolve(configPath)
				});
				return [{ start: statement.getFullStart(), end: statement.end }];
			}
			throw new Error(
				`${configPath}: package-scoped enhancements must use an attributed namespace export`
			);
		}
	);
	const names = new Set<string>();
	for (const registration of registrations) {
		if (names.has(registration.localName))
			throw new Error(
				`${configPath}: duplicate package-scoped enhancement identifier ${JSON.stringify(registration.localName)}`
			);
		names.add(registration.localName);
	}
	let executableSource = source;
	for (const removal of [...removals].reverse())
		executableSource =
			executableSource.slice(0, removal.start) +
			executableSource.slice(removal.start, removal.end).replace(/[^\r\n]/gu, ' ') +
			executableSource.slice(removal.end);
	return Object.freeze({
		executableSource,
		packageEnhancements: Object.freeze(registrations.map((entry) => Object.freeze(entry)))
	});
}

/** Returns string-valued attributes from one static module declaration. */
function importAttributeValues(
	declaration: ts.ImportDeclaration | ts.ExportDeclaration
): Readonly<Record<string, string>> {
	const values: Record<string, string> = {};
	for (const attribute of declaration.attributes?.elements ?? []) {
		const name = ts.isIdentifier(attribute.name) ? attribute.name.text : attribute.name.text;
		if (ts.isStringLiteral(attribute.value)) values[name] = attribute.value.text;
	}
	return values;
}

async function nativeImport(specifier: string): Promise<Record<string, unknown>> {
	return import(
		/* @vite-ignore */
		/* webpackIgnore: true */
		specifier
	) as Promise<Record<string, unknown>>;
}
