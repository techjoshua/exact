import path from 'node:path';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import type { ExpressionProjectOptions } from './contracts.js';
import { ExpressionProjectError } from './errors.js';
import { diskFileVersion } from './filesystem.js';
import { diagnosticFromTs, normalizeFile, scriptKind } from './syntax.js';

export type ExpressionProjectHostStorage = {
	overlays: Map<string, string>;
	overlayVersions: Map<string, number>;
	diskVersions: Map<string, string>;
	diskFileExistence: Map<string, boolean>;
	diskFileContents: Map<string, string | undefined>;
	sourceFiles: Map<string, Readonly<{ version: string; sourceFile: ts.SourceFile }>>;
};

/** Creates the configured TypeScript host and its immutable project settings. */
export function createExpressionProjectHost(
	options: ExpressionProjectOptions,
	storage: ExpressionProjectHostStorage
) {
	const configurationStarted = options.onProfile ? performance.now() : undefined;
	const cwd = path.resolve(options.cwd ?? process.cwd());
	const config = options.tsconfigPath
		? path.resolve(cwd, options.tsconfigPath)
		: ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json');
	if (!config)
		throw new ExpressionProjectError([
			{
				code: 'EXPR_CONFIG_MISSING',
				message: `No tsconfig.json found from ${cwd}`,
				severity: 'error',
				phase: 'configuration'
			}
		]);
	const read = ts.readConfigFile(config, ts.sys.readFile);
	if (read.error)
		throw new ExpressionProjectError([{ ...diagnosticFromTs(read.error), phase: 'configuration' }]);
	const parsed = ts.parseJsonConfigFileContent(
		read.config,
		ts.sys,
		path.dirname(config),
		undefined,
		config
	);
	if (parsed.errors.length)
		throw new ExpressionProjectError(
			parsed.errors.map((error) => ({
				...diagnosticFromTs(error),
				phase: 'configuration' as const
			}))
		);
	const configuredRoots = new Set(parsed.fileNames.map(normalizeFile));
	const forceModuleDetection = options.forceModuleDetection ?? false;
	const compilerOptions = {
		...parsed.options,
		allowJs: true,
		checkJs: parsed.options.checkJs ?? false,
		moduleDetection: forceModuleDetection
			? ts.ModuleDetectionKind.Force
			: parsed.options.moduleDetection
	};
	const moduleResolutionCache = ts.createModuleResolutionCache(
		path.dirname(config),
		ts.sys.useCaseSensitiveFileNames ? (value) => value : (value) => value.toLowerCase(),
		compilerOptions
	);
	const base = ts.createCompilerHost(compilerOptions, true);
	const compilerHost: ts.CompilerHost = {
		...base,
		fileExists: (file) => {
			const normalized = normalizeFile(file);
			if (storage.overlays.has(normalized)) return true;
			const cached = storage.diskFileExistence.get(normalized);
			if (cached !== undefined) return cached;
			const exists = base.fileExists(file);
			storage.diskFileExistence.set(normalized, exists);
			return exists;
		},
		readFile: (file) => {
			const normalized = normalizeFile(file);
			const overlay = storage.overlays.get(normalized);
			if (overlay !== undefined) return overlay;
			if (storage.diskFileContents.has(normalized)) return storage.diskFileContents.get(normalized);
			const contents = base.readFile(file);
			storage.diskFileContents.set(normalized, contents);
			return contents;
		},
		getModuleResolutionCache: () => moduleResolutionCache,
		getSourceFile: (file, languageVersion, onError, shouldCreateNewSourceFile) => {
			const normalized = normalizeFile(file);
			const source = storage.overlays.get(normalized);
			if (source !== undefined) {
				const version = `overlay:${storage.overlayVersions.get(normalized) ?? 0}`;
				const cached = storage.sourceFiles.get(normalized);
				if (cached?.version === version) return cached.sourceFile;
				const created = ts.createSourceFile(
					file,
					source,
					languageVersion,
					true,
					scriptKind(file)
				) as ts.SourceFile & { version?: string };
				created.version = version;
				storage.sourceFiles.set(normalized, { version, sourceFile: created });
				return created;
			}
			const version = storage.diskVersions.get(normalized) ?? diskFileVersion(normalized);
			storage.diskVersions.set(normalized, version);
			const cached = storage.sourceFiles.get(normalized);
			if (cached?.version === version) return cached.sourceFile;
			const created = base.getSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
			if (created) {
				(created as ts.SourceFile & { version?: string }).version = version;
				storage.sourceFiles.set(normalized, { version, sourceFile: created });
			}
			return created;
		}
	};
	if (configurationStarted !== undefined) {
		options.onProfile?.(
			Object.freeze({
				subsystem: 'expressions',
				phase: 'configuration',
				elapsedMs: performance.now() - configurationStarted,
				fileCount: configuredRoots.size
			})
		);
	}
	return {
		tsconfigPath: config,
		parsed,
		forceModuleDetection,
		diagnosticMode: options.diagnostics ?? 'full',
		profileDetail: options.profileDetail ?? 'summary',
		compilerOptions,
		moduleResolutionCache,
		compilerHost,
		configuredRoots
	};
}
