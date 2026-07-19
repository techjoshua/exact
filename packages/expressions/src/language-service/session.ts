import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { ExpressionDiagnostic } from '../model.js';
import {
	diagnosticsForFiles as collectDiagnosticsForFiles,
	normalizeDiagnostic as normalizeLanguageServiceDiagnostic,
	syntacticDiagnostics as collectSyntacticDiagnostics,
	type LanguageServiceDiagnosticContext
} from './diagnostics.js';
import type { ExpressionLanguageServiceOptions, SnapshotEntry } from './contracts.js';
import { canonicalFile, diagnosticFromTs, displayFile, hash, isTsx } from './utilities.js';
import { ExpressionProjectError, findExpressionConfig } from '../project.js';

const sharedDocumentRegistry = ts.createDocumentRegistry(
	ts.sys.useCaseSensitiveFileNames,
	process.cwd()
);

/** Long-lived TypeScript diagnostics and affected-file sidecar. */
export class ExpressionLanguageServiceSession {
	readonly tsconfigPath: string;
	protected readonly cwd: string;
	protected readonly forceModuleDetection: boolean;
	protected parsed!: ts.ParsedCommandLine;
	protected compilerOptions!: ts.CompilerOptions;
	protected moduleResolutionCache!: ts.ModuleResolutionCache;
	protected service!: ts.LanguageService;
	protected builder?: ts.SemanticDiagnosticsBuilderProgram;
	protected readonly overlays = new Map<
		string,
		Readonly<{ filename: string; source: string; version: number }>
	>();
	protected readonly diskRevisions = new Map<string, number>();
	protected readonly snapshots = new Map<string, SnapshotEntry>();
	protected readonly deleted = new Set<string>();
	protected readonly signatures = new Map<string, string>();
	protected readonly reverseDependencies = new Map<string, Set<string>>();
	protected readonly dependencySignatures = new Map<string, string>();
	protected readonly tokenSignatures = new Map<string, string>();
	protected readonly displayNames = new Map<string, string>();
	protected projectVersion = 0;
	protected generation = 0;
	protected affectedFileCount = 0;
	protected diagnosticPassCount = 0;
	protected synchronizationTime = 0;
	protected initialized = false;
	protected disposed = false;

	constructor(options: ExpressionLanguageServiceOptions = {}) {
		this.cwd = path.resolve(options.cwd ?? process.cwd());
		const config = options.tsconfigPath
			? path.resolve(this.cwd, options.tsconfigPath)
			: findExpressionConfig(this.cwd);
		if (!config) {
			throw new ExpressionProjectError([
				{
					code: 'EXPR_CONFIG_MISSING',
					message: `No tsconfig.json found from ${this.cwd}`,
					severity: 'error',
					phase: 'configuration'
				}
			]);
		}
		this.tsconfigPath = config;
		this.forceModuleDetection = options.forceModuleDetection ?? false;
		this.configure();
	}

	protected configure(): void {
		const read = ts.readConfigFile(this.tsconfigPath, ts.sys.readFile);
		if (read.error)
			throw new ExpressionProjectError([
				{ ...diagnosticFromTs(read.error, 'configuration'), phase: 'configuration' }
			]);
		this.parsed = ts.parseJsonConfigFileContent(
			read.config,
			ts.sys,
			path.dirname(this.tsconfigPath),
			undefined,
			this.tsconfigPath
		);
		if (this.parsed.errors.length) {
			throw new ExpressionProjectError(
				this.parsed.errors.map((error) => diagnosticFromTs(error, 'configuration'))
			);
		}
		for (const filename of this.parsed.fileNames) {
			const displayed = displayFile(filename);
			const normalized = canonicalFile(displayed);
			if (!this.displayNames.has(normalized)) this.displayNames.set(normalized, displayed);
		}
		this.compilerOptions = {
			...this.parsed.options,
			allowJs: true,
			checkJs: this.parsed.options.checkJs ?? false,
			moduleDetection: this.forceModuleDetection
				? ts.ModuleDetectionKind.Force
				: this.parsed.options.moduleDetection
		};
		this.moduleResolutionCache = ts.createModuleResolutionCache(
			path.dirname(this.tsconfigPath),
			canonicalFile,
			this.compilerOptions
		);
		const host: ts.LanguageServiceHost = {
			getCompilationSettings: () => this.compilerOptions,
			getCurrentDirectory: () => path.dirname(this.tsconfigPath),
			getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
			getProjectReferences: () => this.parsed.projectReferences,
			getProjectVersion: () => String(this.projectVersion),
			getScriptFileNames: () => this.scriptFileNames(),
			getScriptSnapshot: (filename) => this.snapshot(filename),
			getScriptVersion: (filename) => this.scriptVersion(filename),
			fileExists: (filename) => this.fileExists(filename),
			readFile: (filename) => this.readFile(filename),
			readDirectory: ts.sys.readDirectory,
			directoryExists: ts.sys.directoryExists,
			getDirectories: ts.sys.getDirectories,
			realpath: ts.sys.realpath,
			useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
			resolveModuleNameLiterals: (moduleLiterals, containingFile, _redirectedReference, options) =>
				moduleLiterals.map((literal) => ({
					resolvedModule: ts.resolveModuleName(
						literal.text,
						containingFile,
						options,
						{
							fileExists: (filename) => this.fileExists(filename),
							readFile: (filename) => this.readFile(filename),
							directoryExists: ts.sys.directoryExists,
							getDirectories: ts.sys.getDirectories,
							realpath: ts.sys.realpath
						},
						this.moduleResolutionCache
					).resolvedModule
				}))
		};
		this.service = ts.createLanguageService(host, sharedDocumentRegistry);
	}

	protected reconfigure(): void {
		this.service.dispose();
		this.builder = undefined;
		this.snapshots.clear();
		this.signatures.clear();
		this.reverseDependencies.clear();
		this.dependencySignatures.clear();
		this.tokenSignatures.clear();
		this.configure();
		this.initialized = false;
	}

	protected drainBuilder(): Array<
		Readonly<{ filename?: string; diagnostics: readonly ExpressionDiagnostic[] }>
	> {
		const results: Array<
			Readonly<{ filename?: string; diagnostics: readonly ExpressionDiagnostic[] }>
		> = [];
		let next: ts.AffectedFileResult<readonly ts.Diagnostic[]>;
		while ((next = this.builder!.getSemanticDiagnosticsOfNextAffectedFile())) {
			this.diagnosticPassCount++;
			const sourceFile = 'fileName' in next.affected ? next.affected : undefined;
			results.push(
				Object.freeze({
					...(sourceFile ? { filename: this.preferredFilename(sourceFile.fileName) } : {}),
					diagnostics: Object.freeze(
						next.result.map((diagnostic) => this.normalizeDiagnostic(diagnostic, 'semantic'))
					)
				})
			);
		}
		return results;
	}

	protected refreshProjectMetadata(program: ts.Program): void {
		this.signatures.clear();
		this.refreshDependencyGraph(program);
		for (const filename of this.reverseDependencies.keys()) {
			const signature = this.signatureFor(filename);
			if (signature !== undefined) this.signatures.set(canonicalFile(filename), signature);
		}
	}

	protected refreshDependencyGraph(program: ts.Program): void {
		this.reverseDependencies.clear();
		this.dependencySignatures.clear();
		for (const filename of this.scriptFileNames()) {
			this.dependencySignatures.set(canonicalFile(filename), this.dependencySignature(filename));
			this.tokenSignatures.set(canonicalFile(filename), this.tokenSignature(filename));
			const sourceFile =
				program.getSourceFile(filename) ??
				program
					.getSourceFiles()
					.find((candidate) => canonicalFile(candidate.fileName) === canonicalFile(filename));
			if (!sourceFile) continue;
			for (const dependency of this.builder?.getAllDependencies(sourceFile) ?? []) {
				const normalized = canonicalFile(dependency);
				if (normalized === canonicalFile(filename)) continue;
				let consumers = this.reverseDependencies.get(normalized);
				if (!consumers) this.reverseDependencies.set(normalized, (consumers = new Set()));
				consumers.add(this.preferredFilename(filename));
			}
		}
	}

	protected signatureFor(filename: string): string | undefined {
		if (this.deleted.has(canonicalFile(filename))) return undefined;
		if (filename.endsWith('.d.ts')) {
			const source = this.readFile(filename);
			return source === undefined ? undefined : hash(source);
		}
		const output = this.service.getEmitOutput(filename, true, true);
		if (output.outputFiles.length) {
			return hash(
				output.outputFiles
					.map((file) => `${displayFile(file.name)}\0${file.text}`)
					.sort()
					.join('\0')
			);
		}
		const source = this.readFile(filename);
		return source === undefined ? undefined : hash(source);
	}

	protected dependencySignature(filename: string): string {
		const source = this.readFile(filename);
		if (source === undefined) return '';
		return ts
			.preProcessFile(source, true, true)
			.importedFiles.map((reference) => reference.fileName)
			.sort()
			.join('\0');
	}

	protected tokenSignature(filename: string): string {
		const source = this.readFile(filename);
		if (source === undefined) return '';
		const scanner = ts.createScanner(
			this.compilerOptions.target ?? ts.ScriptTarget.Latest,
			true,
			isTsx(filename) ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
			source
		);
		const tokens: string[] = [];
		for (
			let token = scanner.scan();
			token !== ts.SyntaxKind.EndOfFileToken;
			token = scanner.scan()
		) {
			tokens.push(`${token}:${scanner.getTokenText()}`);
		}
		return hash(tokens.join('\0'));
	}

	protected diagnosticsForFiles(filenames: readonly string[]): ExpressionDiagnostic[] {
		return collectDiagnosticsForFiles(filenames, this.diagnosticContext());
	}

	protected scriptFileNames(): string[] {
		const files = new Set(
			this.parsed.fileNames.map((filename) => this.preferredFilename(filename))
		);
		for (const overlay of this.overlays.values()) files.add(overlay.filename);
		const unique = new Map<string, string>();
		for (const filename of files) unique.set(canonicalFile(filename), filename);
		return [...unique.values()].filter((filename) => !this.deleted.has(canonicalFile(filename)));
	}

	protected hasScript(filename: string): boolean {
		return this.scriptFileNames().some((candidate) => canonicalFile(candidate) === filename);
	}

	protected snapshot(filename: string): ts.IScriptSnapshot | undefined {
		const normalized = canonicalFile(filename);
		if (this.deleted.has(normalized)) return undefined;
		const version = this.scriptVersion(filename);
		const cached = this.snapshots.get(normalized);
		if (cached?.version === version) return cached.snapshot;
		const source = this.readFile(filename);
		if (source === undefined) return undefined;
		const snapshot = ts.ScriptSnapshot.fromString(source);
		this.snapshots.set(normalized, { version, snapshot });
		return snapshot;
	}

	protected scriptVersion(filename: string): string {
		const normalized = canonicalFile(filename);
		const overlay = this.overlays.get(normalized);
		if (overlay) return `overlay:${overlay.version}`;
		let stat = '';
		try {
			const value = fs.statSync(filename);
			stat = `${value.mtimeMs}:${value.size}`;
		} catch {}
		return `disk:${this.diskRevisions.get(normalized) ?? 0}:${stat}`;
	}

	protected fileExists(filename: string): boolean {
		const normalized = canonicalFile(filename);
		if (this.deleted.has(normalized)) return false;
		return this.overlays.has(normalized) || ts.sys.fileExists(filename);
	}

	protected readFile(filename: string): string | undefined {
		const normalized = canonicalFile(filename);
		if (this.deleted.has(normalized)) return undefined;
		return this.overlays.get(normalized)?.source ?? ts.sys.readFile(filename);
	}

	protected preferredFilename(filename: string): string {
		const displayed = displayFile(filename);
		const normalized = canonicalFile(displayed);
		const preferred = this.displayNames.get(normalized) ?? displayed;
		this.displayNames.set(normalized, preferred);
		return preferred;
	}

	protected syntacticDiagnostics(filename: string): ExpressionDiagnostic[] {
		return collectSyntacticDiagnostics(filename, this.diagnosticContext());
	}

	protected normalizeDiagnostic(
		diagnostic: ts.Diagnostic,
		phase: ExpressionDiagnostic['phase']
	): ExpressionDiagnostic {
		return normalizeLanguageServiceDiagnostic(diagnostic, phase, this.diagnosticContext());
	}

	protected diagnosticContext(): LanguageServiceDiagnosticContext {
		return {
			service: this.service,
			compilerOptions: this.compilerOptions,
			deleted: this.deleted,
			readFile: (filename) => this.readFile(filename),
			preferredFilename: (filename) => this.preferredFilename(filename),
			recordPasses: (count) => {
				this.diagnosticPassCount += count;
			}
		};
	}

	protected assertActive(): void {
		if (this.disposed)
			throw new ExpressionProjectError([
				{
					code: 'EXPR_LANGUAGE_SERVICE_DISPOSED',
					message: 'This expression language service has been disposed',
					severity: 'error',
					phase: 'configuration'
				}
			]);
	}
}
