import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { ExpressionDiagnostic } from "./model.js";
import { ExpressionProjectError, findExpressionConfig } from "./project.js";

export type ExpressionLanguageServiceOptions = Readonly<{
  tsconfigPath?: string;
  cwd?: string;
  forceModuleDetection?: boolean;
}>;

export type ExpressionLanguageServiceChange = Readonly<{
  filename: string;
  kind: "upsert" | "delete";
  source?: string;
}>;

export type ExpressionLanguageServiceUpdate = Readonly<{
  generation: number;
  changedFiles: readonly string[];
  affectedFiles: readonly string[];
  diagnostics: readonly ExpressionDiagnostic[];
}>;

export type ExpressionLanguageServiceStats = Readonly<{
  generations: number;
  snapshots: number;
  scripts: number;
  affectedFiles: number;
  diagnosticPasses: number;
  synchronizationMs: number;
}>;

type SnapshotEntry = Readonly<{ version: string; snapshot: ts.IScriptSnapshot }>;

const sharedDocumentRegistry = ts.createDocumentRegistry(
  ts.sys.useCaseSensitiveFileNames,
  process.cwd()
);

/** Long-lived TypeScript diagnostics and affected-file sidecar. */
export class ExpressionLanguageService {
  readonly tsconfigPath: string;
  private readonly cwd: string;
  private readonly forceModuleDetection: boolean;
  private parsed!: ts.ParsedCommandLine;
  private compilerOptions!: ts.CompilerOptions;
  private moduleResolutionCache!: ts.ModuleResolutionCache;
  private service!: ts.LanguageService;
  private builder?: ts.SemanticDiagnosticsBuilderProgram;
  private readonly overlays = new Map<string, Readonly<{ filename: string; source: string; version: number }>>();
  private readonly diskRevisions = new Map<string, number>();
  private readonly snapshots = new Map<string, SnapshotEntry>();
  private readonly deleted = new Set<string>();
  private readonly signatures = new Map<string, string>();
  private readonly reverseDependencies = new Map<string, Set<string>>();
  private readonly dependencySignatures = new Map<string, string>();
  private readonly tokenSignatures = new Map<string, string>();
  private readonly displayNames = new Map<string, string>();
  private projectVersion = 0;
  private generation = 0;
  private affectedFileCount = 0;
  private diagnosticPassCount = 0;
  private synchronizationTime = 0;
  private initialized = false;
  private disposed = false;

  constructor(options: ExpressionLanguageServiceOptions = {}) {
    this.cwd = path.resolve(options.cwd ?? process.cwd());
    const config = options.tsconfigPath
      ? path.resolve(this.cwd, options.tsconfigPath)
      : findExpressionConfig(this.cwd);
    if (!config) {
      throw new ExpressionProjectError([{
        code: "EXPR_CONFIG_MISSING",
        message: `No tsconfig.json found from ${this.cwd}`,
        severity: "error",
        phase: "configuration"
      }]);
    }
    this.tsconfigPath = config;
    this.forceModuleDetection = options.forceModuleDetection ?? false;
    this.configure();
  }

  synchronize(changes: Iterable<ExpressionLanguageServiceChange>): ExpressionLanguageServiceUpdate {
    this.assertActive();
    const started = performance.now();
    const changedFiles: string[] = [];
    const hadBaseline = this.initialized;
    let structural = false;
    for (const change of changes) {
      const requestedFilename = displayFile(change.filename);
      const normalized = canonicalFile(requestedFilename);
      const previous = this.overlays.get(normalized);
      const filename = previous?.filename ?? this.displayNames.get(normalized) ?? requestedFilename;
      this.displayNames.set(normalized, filename);
      if (change.kind === "upsert" && change.source !== undefined && previous?.source === change.source) continue;
      if (change.kind === "delete" && this.deleted.has(normalized)) continue;
      changedFiles.push(filename);
      structural ||= change.kind === "delete"
        || !this.hasScript(normalized)
        || isConfigurationDependency(filename);
      this.snapshots.delete(normalized);
      this.diskRevisions.set(normalized, (this.diskRevisions.get(normalized) ?? 0) + 1);
      if (change.kind === "delete") {
        this.overlays.delete(normalized);
        this.deleted.add(normalized);
      } else {
        this.deleted.delete(normalized);
        if (change.source === undefined) this.overlays.delete(normalized);
        else {
          this.overlays.set(normalized, {
            filename,
            source: change.source,
            version: (previous?.version ?? 0) + 1
          });
        }
      }
    }
    if (!changedFiles.length) return freezeUpdate(this.generation, [], [], []);
    this.projectVersion++;
    this.generation++;

    if (structural && this.initialized) this.reconfigure();
    if (this.initialized && !structural && changedFiles.every(filename => {
      const normalized = canonicalFile(filename);
      return !this.reverseDependencies.get(normalized)?.size
        && this.dependencySignatures.get(normalized) === this.dependencySignature(filename);
    })) {
      const diagnostics: ExpressionDiagnostic[] = [];
      for (const filename of changedFiles) {
        if (this.deleted.has(canonicalFile(filename)) || !isScript(filename)) continue;
        const normalized = canonicalFile(filename);
        const previousTokens = this.tokenSignatures.get(normalized);
        const nextTokens = this.tokenSignature(filename);
        this.tokenSignatures.set(normalized, nextTokens);
        this.diagnosticPassCount++;
        diagnostics.push(...this.syntacticDiagnostics(filename));
        if (previousTokens !== nextTokens) {
          this.diagnosticPassCount++;
          diagnostics.push(...this.service.getSemanticDiagnostics(filename)
            .map(diagnostic => this.normalizeDiagnostic(diagnostic, "semantic")));
        }
      }
      const affectedFiles = changedFiles.map(filename => this.preferredFilename(filename)).sort();
      this.affectedFileCount += affectedFiles.length;
      this.synchronizationTime += performance.now() - started;
      return freezeUpdate(this.generation, changedFiles, affectedFiles, uniqueDiagnostics(diagnostics));
    }
    const program = this.service.getProgram();
    if (!program) throw new ExpressionProjectError([{
      code: "EXPR_LANGUAGE_SERVICE_PROGRAM",
      message: `TypeScript did not create a configured program for ${this.tsconfigPath}`,
      severity: "error",
      phase: "configuration"
    }]);
    this.builder = ts.createSemanticDiagnosticsBuilderProgram(
      program,
      { createHash: ts.sys.createHash },
      this.builder
    );

    if (!this.initialized) {
      this.drainBuilder();
      this.initialized = true;
      this.refreshProjectMetadata(program);
      if (hadBaseline) {
        const affectedFiles = this.scriptFileNames().sort();
        const diagnostics = this.diagnosticsForFiles(affectedFiles);
        this.affectedFileCount += affectedFiles.length;
        this.synchronizationTime += performance.now() - started;
        return freezeUpdate(this.generation, changedFiles, affectedFiles, diagnostics);
      }
      this.synchronizationTime += performance.now() - started;
      return freezeUpdate(this.generation, changedFiles, [], []);
    }

    const semantic = this.drainBuilder();
    const affected = new Map<string, string>();
    const diagnostics: ExpressionDiagnostic[] = [];
    for (const result of semantic) {
      if (result.filename) affected.set(canonicalFile(result.filename), this.preferredFilename(result.filename));
      diagnostics.push(...result.diagnostics);
    }
    for (const filename of changedFiles) {
      const normalized = canonicalFile(filename);
      const consumers = this.reverseDependencies.get(normalized);
      if (consumers?.size) {
        const previousSignature = this.signatures.get(normalized);
        const nextSignature = this.signatureFor(filename);
        if (nextSignature !== undefined) this.signatures.set(normalized, nextSignature);
        else this.signatures.delete(normalized);
        if (previousSignature !== nextSignature) for (const consumer of consumers) {
          affected.set(canonicalFile(consumer), this.preferredFilename(consumer));
        }
      }
    }
    for (const filename of changedFiles) {
      if (this.deleted.has(canonicalFile(filename)) || !isScript(filename)) continue;
      affected.set(canonicalFile(filename), this.preferredFilename(filename));
      this.diagnosticPassCount++;
      diagnostics.push(...this.syntacticDiagnostics(filename));
    }
    const affectedFiles = [...affected.values()].sort();
    const semanticFilesAlreadyReported = new Set(
      diagnostics.flatMap(diagnostic => diagnostic.filename ? [canonicalFile(diagnostic.filename)] : [])
    );
    for (const filename of affectedFiles) {
      if (this.deleted.has(canonicalFile(filename)) || semanticFilesAlreadyReported.has(canonicalFile(filename))) continue;
      this.diagnosticPassCount++;
      diagnostics.push(...this.service.getSemanticDiagnostics(filename).map(diagnostic => this.normalizeDiagnostic(diagnostic, "semantic")));
    }
    this.refreshDependencyGraph(program);
    this.affectedFileCount += affectedFiles.length;
    this.synchronizationTime += performance.now() - started;
    return freezeUpdate(this.generation, changedFiles, affectedFiles, uniqueDiagnostics(diagnostics));
  }

  stats(): ExpressionLanguageServiceStats {
    this.assertActive();
    return Object.freeze({
      generations: this.generation,
      snapshots: this.snapshots.size,
      scripts: this.scriptFileNames().length,
      affectedFiles: this.affectedFileCount,
      diagnosticPasses: this.diagnosticPassCount,
      synchronizationMs: this.synchronizationTime
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.service.dispose();
    this.builder = undefined;
    this.overlays.clear();
    this.diskRevisions.clear();
    this.snapshots.clear();
    this.deleted.clear();
    this.signatures.clear();
    this.reverseDependencies.clear();
    this.dependencySignatures.clear();
    this.tokenSignatures.clear();
    this.displayNames.clear();
  }

  private configure(): void {
    const read = ts.readConfigFile(this.tsconfigPath, ts.sys.readFile);
    if (read.error) throw new ExpressionProjectError([{ ...diagnosticFromTs(read.error, "configuration"), phase: "configuration" }]);
    this.parsed = ts.parseJsonConfigFileContent(
      read.config,
      ts.sys,
      path.dirname(this.tsconfigPath),
      undefined,
      this.tsconfigPath
    );
    if (this.parsed.errors.length) {
      throw new ExpressionProjectError(this.parsed.errors.map(error => diagnosticFromTs(error, "configuration")));
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
      getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
      getProjectReferences: () => this.parsed.projectReferences,
      getProjectVersion: () => String(this.projectVersion),
      getScriptFileNames: () => this.scriptFileNames(),
      getScriptSnapshot: filename => this.snapshot(filename),
      getScriptVersion: filename => this.scriptVersion(filename),
      fileExists: filename => this.fileExists(filename),
      readFile: filename => this.readFile(filename),
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
      realpath: ts.sys.realpath,
      useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
      resolveModuleNameLiterals: (moduleLiterals, containingFile, _redirectedReference, options) =>
        moduleLiterals.map(literal => ({
          resolvedModule: ts.resolveModuleName(
            literal.text,
            containingFile,
            options,
            {
              fileExists: filename => this.fileExists(filename),
              readFile: filename => this.readFile(filename),
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

  private reconfigure(): void {
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

  private drainBuilder(): Array<Readonly<{ filename?: string; diagnostics: readonly ExpressionDiagnostic[] }>> {
    const results: Array<Readonly<{ filename?: string; diagnostics: readonly ExpressionDiagnostic[] }>> = [];
    let next: ts.AffectedFileResult<readonly ts.Diagnostic[]>;
    while ((next = this.builder!.getSemanticDiagnosticsOfNextAffectedFile())) {
      this.diagnosticPassCount++;
      const sourceFile = "fileName" in next.affected ? next.affected : undefined;
      results.push(Object.freeze({
        ...(sourceFile ? { filename: this.preferredFilename(sourceFile.fileName) } : {}),
        diagnostics: Object.freeze(next.result.map(diagnostic => this.normalizeDiagnostic(diagnostic, "semantic")))
      }));
    }
    return results;
  }

  private refreshProjectMetadata(program: ts.Program): void {
    this.signatures.clear();
    this.refreshDependencyGraph(program);
    for (const filename of this.reverseDependencies.keys()) {
      const signature = this.signatureFor(filename);
      if (signature !== undefined) this.signatures.set(canonicalFile(filename), signature);
    }
  }

  private refreshDependencyGraph(program: ts.Program): void {
    this.reverseDependencies.clear();
    this.dependencySignatures.clear();
    for (const filename of this.scriptFileNames()) {
      this.dependencySignatures.set(canonicalFile(filename), this.dependencySignature(filename));
      this.tokenSignatures.set(canonicalFile(filename), this.tokenSignature(filename));
      const sourceFile = program.getSourceFile(filename)
        ?? program.getSourceFiles().find(candidate => canonicalFile(candidate.fileName) === canonicalFile(filename));
      if (!sourceFile) continue;
      for (const dependency of this.builder?.getAllDependencies(sourceFile) ?? []) {
        const normalized = canonicalFile(dependency);
        if (normalized === canonicalFile(filename)) continue;
        let consumers = this.reverseDependencies.get(normalized);
        if (!consumers) this.reverseDependencies.set(normalized, consumers = new Set());
        consumers.add(this.preferredFilename(filename));
      }
    }
  }

  private signatureFor(filename: string): string | undefined {
    if (this.deleted.has(canonicalFile(filename))) return undefined;
    if (filename.endsWith(".d.ts")) {
      const source = this.readFile(filename);
      return source === undefined ? undefined : hash(source);
    }
    const output = this.service.getEmitOutput(filename, true, true);
    if (output.outputFiles.length) {
      return hash(output.outputFiles
        .map(file => `${displayFile(file.name)}\0${file.text}`)
        .sort()
        .join("\0"));
    }
    const source = this.readFile(filename);
    return source === undefined ? undefined : hash(source);
  }

  private dependencySignature(filename: string): string {
    const source = this.readFile(filename);
    if (source === undefined) return "";
    return ts.preProcessFile(source, true, true).importedFiles
      .map(reference => reference.fileName)
      .sort()
      .join("\0");
  }

  private tokenSignature(filename: string): string {
    const source = this.readFile(filename);
    if (source === undefined) return "";
    const scanner = ts.createScanner(
      this.compilerOptions.target ?? ts.ScriptTarget.Latest,
      true,
      isTsx(filename) ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
      source
    );
    const tokens: string[] = [];
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      tokens.push(`${token}:${scanner.getTokenText()}`);
    }
    return hash(tokens.join("\0"));
  }

  private diagnosticsForFiles(filenames: readonly string[]): ExpressionDiagnostic[] {
    const diagnostics: ExpressionDiagnostic[] = [];
    for (const filename of filenames) {
      if (this.deleted.has(canonicalFile(filename))) continue;
      this.diagnosticPassCount += 2;
      diagnostics.push(...this.syntacticDiagnostics(filename));
      diagnostics.push(...this.service.getSemanticDiagnostics(filename).map(diagnostic => this.normalizeDiagnostic(diagnostic, "semantic")));
    }
    return uniqueDiagnostics(diagnostics);
  }

  private scriptFileNames(): string[] {
    const files = new Set(this.parsed.fileNames.map(filename => this.preferredFilename(filename)));
    for (const overlay of this.overlays.values()) files.add(overlay.filename);
    const unique = new Map<string, string>();
    for (const filename of files) unique.set(canonicalFile(filename), filename);
    return [...unique.values()].filter(filename => !this.deleted.has(canonicalFile(filename)));
  }

  private hasScript(filename: string): boolean {
    return this.scriptFileNames().some(candidate => canonicalFile(candidate) === filename);
  }

  private snapshot(filename: string): ts.IScriptSnapshot | undefined {
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

  private scriptVersion(filename: string): string {
    const normalized = canonicalFile(filename);
    const overlay = this.overlays.get(normalized);
    if (overlay) return `overlay:${overlay.version}`;
    let stat = "";
    try {
      const value = fs.statSync(filename);
      stat = `${value.mtimeMs}:${value.size}`;
    } catch {}
    return `disk:${this.diskRevisions.get(normalized) ?? 0}:${stat}`;
  }

  private fileExists(filename: string): boolean {
    const normalized = canonicalFile(filename);
    if (this.deleted.has(normalized)) return false;
    return this.overlays.has(normalized) || ts.sys.fileExists(filename);
  }

  private readFile(filename: string): string | undefined {
    const normalized = canonicalFile(filename);
    if (this.deleted.has(normalized)) return undefined;
    return this.overlays.get(normalized)?.source ?? ts.sys.readFile(filename);
  }

  private preferredFilename(filename: string): string {
    const displayed = displayFile(filename);
    const normalized = canonicalFile(displayed);
    const preferred = this.displayNames.get(normalized) ?? displayed;
    this.displayNames.set(normalized, preferred);
    return preferred;
  }

  private syntacticDiagnostics(filename: string): ExpressionDiagnostic[] {
    const source = this.readFile(filename);
    if (source === undefined) return [];
    const {
      composite: _composite,
      declaration: _declaration,
      incremental: _incremental,
      moduleDetection: _moduleDetection,
      noEmit: _noEmit,
      ...transpileOptions
    } = this.compilerOptions;
    const result = ts.transpileModule(source, {
      compilerOptions: transpileOptions,
      fileName: filename,
      reportDiagnostics: true
    });
    return (result.diagnostics ?? []).map(diagnostic => {
      const normalized = this.normalizeDiagnostic(diagnostic, "syntax");
      return normalized.filename
        ? normalized
        : { ...normalized, filename: this.preferredFilename(filename) };
    });
  }

  private normalizeDiagnostic(
    diagnostic: ts.Diagnostic,
    phase: ExpressionDiagnostic["phase"]
  ): ExpressionDiagnostic {
    const normalized = diagnosticFromTs(diagnostic, phase);
    return normalized.filename
      ? { ...normalized, filename: this.preferredFilename(normalized.filename) }
      : normalized;
  }

  private assertActive(): void {
    if (this.disposed) throw new ExpressionProjectError([{
      code: "EXPR_LANGUAGE_SERVICE_DISPOSED",
      message: "This expression language service has been disposed",
      severity: "error",
      phase: "configuration"
    }]);
  }
}

export function createExpressionLanguageService(
  options: ExpressionLanguageServiceOptions = {}
): ExpressionLanguageService {
  return new ExpressionLanguageService(options);
}

function freezeUpdate(
  generation: number,
  changedFiles: readonly string[],
  affectedFiles: readonly string[],
  diagnostics: readonly ExpressionDiagnostic[]
): ExpressionLanguageServiceUpdate {
  return Object.freeze({
    generation,
    changedFiles: Object.freeze([...changedFiles]),
    affectedFiles: Object.freeze([...affectedFiles]),
    diagnostics: Object.freeze([...diagnostics])
  });
}

function uniqueDiagnostics(diagnostics: readonly ExpressionDiagnostic[]): ExpressionDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter(diagnostic => {
    const key = `${diagnostic.filename}:${diagnostic.code}:${diagnostic.span?.start}:${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function diagnosticFromTs(
  diagnostic: ts.Diagnostic,
  phase: ExpressionDiagnostic["phase"]
): ExpressionDiagnostic {
  const source = diagnostic.file;
  const start = diagnostic.start;
  const location = source && start !== undefined ? source.getLineAndCharacterOfPosition(start) : undefined;
  return {
    code: `TS${diagnostic.code}`,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    severity: diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning",
    phase,
    filename: source ? displayFile(source.fileName) : undefined,
    span: start === undefined || !location ? undefined : {
      start,
      end: start + (diagnostic.length ?? 0),
      line: location.line + 1,
      column: location.character + 1
    }
  };
}

function isConfigurationDependency(filename: string): boolean {
  return /(?:^|[\\/])(?:tsconfig(?:\.[^\\/]+)?\.json|package\.json)$/i.test(filename);
}

function isScript(filename: string): boolean {
  return /\.[cm]?[jt]sx?$/i.test(filename);
}

function isTsx(filename: string): boolean {
  return /\.[cm]?[jt]sx$/i.test(filename);
}

function displayFile(filename: string): string {
  return path.resolve(filename).replaceAll("\\", "/");
}

function canonicalFile(filename: string): string {
  const displayed = displayFile(filename);
  return ts.sys.useCaseSensitiveFileNames ? displayed : displayed.toLowerCase();
}

function hash(value: string): string {
  return ts.sys.createHash?.(value) ?? String(value.length);
}
