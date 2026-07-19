import ts from "typescript";
import path from "node:path";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import type { ExactProfileEvent, ExactProfileSink } from "@exact/instrumentation";
import type {
  ExpressionDiagnostic,
  ExpressionDirective,
  ExpressionCallSignature,
  ExpressionNode,
  ExpressionScope,
  ExpressionSymbol,
  ExpressionType,
  ExpressionTypeKind,
  NodeCategory,
  ScopeKind,
  SourceSpan,
  Variable
} from "./model.js";
import { createModule, type BoundModule, type UnboundModule } from "./module.js";
import { ExclusiveTimer } from "./profiling.js";

export interface ExpressionProjectOptions {
  readonly tsconfigPath?: string;
  readonly cwd?: string;
  /** Keeps independently supplied virtual sources out of TypeScript's shared script global scope. */
  readonly forceModuleDetection?: boolean;
  /** Controls diagnostic collection without disabling TypeChecker-backed binding. */
  readonly diagnostics?: "syntax" | "full";
  /** Receives opt-in phase timings and structural counters for profiling. */
  readonly onProfile?: ExactProfileSink<ExpressionProjectProfileEvent>;
  /**
   * Controls instrumentation granularity.
   *
   * Detailed profiling samples internal projection stages and therefore adds
   * per-node timing overhead. It should be enabled for investigations, not
   * routine production telemetry.
   */
  readonly profileDetail?: "summary" | "detailed";
}

export type ExpressionProjectProfileEvent = ExactProfileEvent<
  "expressions",
  | "configuration"
  | "program"
  | "syntax-diagnostics"
  | "semantic-diagnostics"
  | "module-projection"
  | "projection-identity"
  | "projection-node-conversion"
  | "projection-node-metadata"
  | "projection-node-types"
  | "projection-node-bindings"
  | "projection-node-common"
  | "projection-node-specialization"
  | "projection-node-overhead"
  | "projection-finalization"
  | "projection-type-display"
  | "projection-type-members"
  | "projection-type-signatures"
  | "projection-type-properties"
  | "projection-type-arguments"
  | "projection-type-directives"
  | "projection-type-construction"
> & Readonly<{
  filename?: string;
  fileCount?: number;
  nodeCount?: number;
  typeCount?: number;
  shallowTypeCount?: number;
  symbolCount?: number;
  scopeCount?: number;
  typeCacheHits?: number;
  typeCacheMisses?: number;
  shallowTypeCacheHits?: number;
  shallowTypeCacheMisses?: number;
  checkerTypeQueries?: number;
  checkerSymbolQueries?: number;
  resolvedSignatureQueries?: number;
  directiveScans?: number;
  directiveCharacters?: number;
}>;

export type ExpressionProjectStats = Readonly<{
  rebuilds: number;
  semanticDiagnostics: number;
  overlays: number;
  sourceFiles: number;
  nodeIdentityRoots: number;
  symbolIdentities: number;
}>;

type TypeProjectionBucket =
  | "display"
  | "members"
  | "signatures"
  | "properties"
  | "arguments"
  | "directives"
  | "construction";

export class ExpressionProjectError extends Error {
  constructor(readonly diagnostics: readonly ExpressionDiagnostic[]) {
    super(diagnostics.map(formatExpressionDiagnostic).join("\n"));
    this.name = "ExpressionProjectError";
  }
}

function formatExpressionDiagnostic(diagnostic: ExpressionDiagnostic): string {
  const location = diagnostic.filename
    ? `${diagnostic.filename}${diagnostic.span ? `:${diagnostic.span.line}:${diagnostic.span.column}` : ""}`
    : diagnostic.span
      ? `${diagnostic.span.line}:${diagnostic.span.column}`
      : undefined;
  return `${location ? `${location} - ` : ""}${diagnostic.code}: ${diagnostic.message}`;
}

class ProjectScope implements ExpressionScope {
  private owned: Variable[] = [];
  private readonly members = new Set<Variable>();
  constructor(readonly id: string, readonly kind: ScopeKind, readonly parent?: ExpressionScope) {}
  get variables(): readonly Variable[] { return this.owned; }
  add(variable: Variable): void {
    if (this.members.has(variable)) return;
    this.members.add(variable);
    this.owned.push(variable);
  }
  seal(): void { Object.freeze(this.owned); }
}

class ProjectVariable implements Variable {
  readonly id: string;
  constructor(readonly symbol: ExpressionSymbol, name: string, kind: string, scope: ExpressionScope, readonly mutable: boolean, readonly synthetic = false) {
    this.id = symbol.id;
    this.name = name;
    this.declarationKind = kind;
    this.scope = scope;
  }
  readonly name: string;
  readonly declarationKind: string;
  readonly scope: ExpressionScope;
  type?: ExpressionType;
  exported = false;
  importedFrom?: string;
  typeOnly = false;
  directives?: readonly ExpressionDirective[];
}

class ProjectType implements ExpressionType {
  constructor(
    readonly id: string,
    readonly kind: ExpressionTypeKind,
    readonly display: string,
    readonly nullable: boolean,
    readonly callable: boolean,
    readonly properties: readonly string[],
    readonly propertyTypes: ExpressionType["propertyTypes"],
    readonly unionMembers: readonly ExpressionType[],
    readonly callSignatures: readonly ExpressionCallSignature[],
    readonly typeArguments: readonly ExpressionType[],
    readonly typeParameters: readonly string[],
    readonly collectionKind?: "array" | "readonly-array" | "tuple",
    readonly directives?: readonly ExpressionDirective[]
  ) { Object.freeze(this); }
}

/** Project-aware TypeScript bridge. No TypeScript compiler objects escape this class. */
export class ExpressionProject {
  readonly tsconfigPath: string;
  private readonly parsed: ts.ParsedCommandLine;
  private readonly forceModuleDetection: boolean;
  private readonly diagnosticMode: "syntax" | "full";
  private readonly onProfile?: ExactProfileSink<ExpressionProjectProfileEvent>;
  private readonly profileDetail: "summary" | "detailed";
  private readonly compilerOptions: ts.CompilerOptions;
  private readonly compilerHost: ts.CompilerHost;
  private readonly moduleResolutionCache: ts.ModuleResolutionCache;
  private readonly overlays = new Map<string, string>();
  private readonly overlayVersions = new Map<string, number>();
  private readonly diskVersions = new Map<string, string>();
  private readonly diskFileExistence = new Map<string, boolean>();
  private readonly diskFileContents = new Map<string, string | undefined>();
  private readonly sourceFiles = new Map<string, Readonly<{ version: string; sourceFile: ts.SourceFile }>>();
  private readonly boundModules = new Map<string, Readonly<{ program: ts.Program; module: BoundModule }>>();
  private readonly configuredRoots: ReadonlySet<string>;
  private readonly diskRoots = new Set<string>();
  private readonly nodeIdentityRoots = new Map<string, ExpressionNode>();
  private readonly symbolIdentities = new Map<string, ExpressionSymbol>();
  private readonly identityKeysByFile = new Map<string, Set<string>>();
  private typeHandles = new WeakMap<ExpressionType, ts.Type>();
  private program?: ts.Program;
  private dirty = false;
  private rebuildCount = 0;
  private semanticDiagnosticCount = 0;
  private disposed = false;

  constructor(options: ExpressionProjectOptions = {}) {
    const configurationStarted = options.onProfile ? performance.now() : undefined;
    this.onProfile = options.onProfile;
    this.profileDetail = options.profileDetail ?? "summary";
    const cwd = path.resolve(options.cwd ?? process.cwd());
    const config = options.tsconfigPath
      ? path.resolve(cwd, options.tsconfigPath)
      : ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
    if (!config) throw new ExpressionProjectError([{ code: "EXPR_CONFIG_MISSING", message: `No tsconfig.json found from ${cwd}`, severity: "error", phase: "configuration" }]);
    this.tsconfigPath = config;
    this.forceModuleDetection = options.forceModuleDetection ?? false;
    this.diagnosticMode = options.diagnostics ?? "full";
    const read = ts.readConfigFile(config, ts.sys.readFile);
    if (read.error) throw new ExpressionProjectError([{ ...diagnosticFromTs(read.error), phase: "configuration" }]);
    this.parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(config), undefined, config);
    if (this.parsed.errors.length) throw new ExpressionProjectError(this.parsed.errors.map(error => ({ ...diagnosticFromTs(error), phase: "configuration" as const })));
    this.configuredRoots = new Set(this.parsed.fileNames.map(normalizeFile));
    this.compilerOptions = {
      ...this.parsed.options,
      // JavaScript modules are part of the supported runtime grammar even when
      // a project's normal typecheck excludes them.
      allowJs: true,
      checkJs: this.parsed.options.checkJs ?? false,
      moduleDetection: this.forceModuleDetection ? ts.ModuleDetectionKind.Force : this.parsed.options.moduleDetection
    };
    this.moduleResolutionCache = ts.createModuleResolutionCache(
      path.dirname(config),
      ts.sys.useCaseSensitiveFileNames ? value => value : value => value.toLowerCase(),
      this.compilerOptions
    );
    const base = ts.createCompilerHost(this.compilerOptions, true);
    this.compilerHost = {
      ...base,
      fileExists: file => {
        const normalized = normalizeFile(file);
        if (this.overlays.has(normalized)) return true;
        const cached = this.diskFileExistence.get(normalized);
        if (cached !== undefined) return cached;
        const exists = base.fileExists(file);
        this.diskFileExistence.set(normalized, exists);
        return exists;
      },
      readFile: file => {
        const normalized = normalizeFile(file);
        const overlay = this.overlays.get(normalized);
        if (overlay !== undefined) return overlay;
        if (this.diskFileContents.has(normalized)) return this.diskFileContents.get(normalized);
        const contents = base.readFile(file);
        this.diskFileContents.set(normalized, contents);
        return contents;
      },
      getModuleResolutionCache: () => this.moduleResolutionCache,
      getSourceFile: (file, languageVersion, onError, shouldCreateNewSourceFile) => {
        const normalized = normalizeFile(file);
        const source = this.overlays.get(normalized);
        if (source !== undefined) {
          const version = `overlay:${this.overlayVersions.get(normalized) ?? 0}`;
          const cached = this.sourceFiles.get(normalized);
          if (cached?.version === version) return cached.sourceFile;
          const created = ts.createSourceFile(file, source, languageVersion, true, scriptKind(file)) as ts.SourceFile & { version?: string };
          created.version = version;
          this.sourceFiles.set(normalized, { version, sourceFile: created });
          return created;
        }
        const version = this.diskVersions.get(normalized) ?? diskFileVersion(normalized);
        this.diskVersions.set(normalized, version);
        const cached = this.sourceFiles.get(normalized);
        if (cached?.version === version) return cached.sourceFile;
        const created = base.getSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
        if (created) {
          (created as ts.SourceFile & { version?: string }).version = version;
          this.sourceFiles.set(normalized, { version, sourceFile: created });
        }
        return created;
      }
    };
    if (configurationStarted !== undefined) {
      this.recordProfile({
        subsystem: "expressions",
        phase: "configuration",
        elapsedMs: performance.now() - configurationStarted,
        fileCount: this.configuredRoots.size
      });
    }
  }

  updateModule(filename: string, source: string): BoundModule {
    this.assertActive();
    const normalized = normalizeFile(filename);
    const changed = this.setOverlay(normalized, source);
    const cached = this.boundModules.get(normalized);
    if (!changed && !this.dirty && this.program && cached?.program === this.program) return cached.module;
    this.rebuild();
    return this.readBoundModule(normalized);
  }

  updateModules(entries: Iterable<readonly [filename: string, source: string]>): ReadonlyMap<string, BoundModule> {
    const filenames: Array<Readonly<{ display: string; canonical: string }>> = [];
    let changed = false;
    for (const [filename, source] of entries) {
      const normalized = normalizeFile(filename);
      filenames.push({ display: displayFile(filename), canonical: normalized });
      changed = this.setOverlay(normalized, source) || changed;
    }
    if (!changed && !this.dirty && this.program) {
      const cached = filenames.map(filename => [filename, this.boundModules.get(filename.canonical)] as const);
      if (cached.every(([, entry]) => entry?.program === this.program)) {
        return new Map(cached.map(([filename, entry]) => [filename.display, entry!.module]));
      }
    }
    this.rebuild();
    return this.readBoundModules(filenames);
  }

  /**
   * Loads one disk-backed source as a project root without retaining an
   * identical in-memory overlay.
   */
  loadModule(filename: string): BoundModule {
    return this.loadModules([filename]).get(displayFile(filename))!;
  }

  /**
   * Loads disk-backed sources as project roots in one rebuild.
   *
   * Files outside the configured include patterns remain roots until removed.
   * Call {@link invalidateFile} after an external write to refresh cached disk
   * contents without removing that root.
   */
  loadModules(filenames: Iterable<string>): ReadonlyMap<string, BoundModule> {
    this.assertActive();
    const requested: Array<Readonly<{ display: string; canonical: string }>> = [];
    for (const filename of filenames) {
      const canonical = normalizeFile(filename);
      requested.push({ display: displayFile(filename), canonical });
      if (!this.configuredRoots.has(canonical) && !this.diskRoots.has(canonical)) {
        this.diskRoots.add(canonical);
        this.dirty = true;
      }
    }
    if (!this.program || this.dirty) this.rebuild();
    return this.readBoundModules(requested);
  }

  getModule(filename: string, source?: string): BoundModule {
    this.assertActive();
    const normalized = normalizeFile(filename);
    if (source !== undefined) return this.updateModule(normalized, source);
    if (!this.program || this.dirty) this.rebuild();
    return this.readBoundModule(normalized);
  }

  async bind(module: UnboundModule): Promise<BoundModule> {
    const structuralErrors = module.validate().filter(diagnostic => diagnostic.severity === "error");
    if (structuralErrors.length) throw new ExpressionProjectError(structuralErrors);
    const emitted = module.emit({ format: "generated" }).code;
    const bound = this.updateModule(module.filename, emitted);
    if (!module.provenance) return bound;
    return createModule({
      filename: bound.filename,
      source: bound.source,
      root: bound.rootNode,
      state: "bound",
      diagnostics: bound.diagnostics,
      trivia: bound.trivia,
      provenance: module.provenance
    });
  }

  emit(module: BoundModule, options: Parameters<BoundModule["emit"]>[0] = {}) {
    const errors = module.diagnostics.filter(diagnostic => diagnostic.severity === "error");
    if (errors.length) throw new ExpressionProjectError(errors);
    return module.emit(options);
  }

  isAssignable(source: ExpressionType, target: ExpressionType): boolean {
    const sourceHandle = this.typeHandles.get(source);
    const targetHandle = this.typeHandles.get(target);
    if (sourceHandle && targetHandle && this.program) {
      return this.program.getTypeChecker().isTypeAssignableTo(sourceHandle, targetHandle);
    }
    if (source.id === target.id || target.kind === "any" || target.kind === "unknown" || source.kind === "never") return true;
    if (target.kind === "union") return target.unionMembers.some(member => this.isAssignable(source, member));
    if (source.kind === "union") return source.unionMembers.every(member => this.isAssignable(member, target));
    return source.display === target.display;
  }

  /** Resolves a runtime import using this project's exact TypeScript configuration. */
  resolveModuleSpecifier(specifier: string, containingFile: string): string | undefined {
    this.assertActive();
    const resolved = ts.resolveModuleName(specifier, containingFile, this.parsed.options, {
      ...ts.sys,
      fileExists: file => this.overlays.has(normalizeFile(file)) || ts.sys.fileExists(file),
      readFile: file => this.overlays.get(normalizeFile(file)) ?? ts.sys.readFile(file)
    }, this.moduleResolutionCache).resolvedModule;
    return resolved ? displayFile(resolved.resolvedFileName) : undefined;
  }

  /** Removes an in-memory source and invalidates any cached disk syntax for it. */
  removeModule(filename: string): void {
    this.removeModules([filename]);
  }

  /** Removes in-memory sources as one project update. */
  removeModules(filenames: Iterable<string>): void {
    this.assertActive();
    for (const filename of filenames) {
      const normalized = normalizeFile(filename);
      this.overlays.delete(normalized);
      this.overlayVersions.delete(normalized);
      this.sourceFiles.delete(normalized);
      this.diskVersions.delete(normalized);
      this.diskFileExistence.delete(normalized);
      this.diskFileContents.delete(normalized);
      this.boundModules.delete(normalized);
      this.diskRoots.delete(normalized);
      this.nodeIdentityRoots.delete(normalized);
      const identityKeys = this.identityKeysByFile.get(normalized);
      for (const key of identityKeys ?? []) this.symbolIdentities.delete(key);
      this.identityKeysByFile.delete(normalized);
    }
    // Additions and removals can change resolution for otherwise unchanged imports.
    this.moduleResolutionCache.clear();
    this.dirty = true;
  }

  /** Invalidates a disk-backed source before the next incremental rebuild. */
  invalidateFile(filename: string): void {
    this.invalidateFiles([filename]);
  }

  /** Invalidates disk-backed sources as one lazy project update. */
  invalidateFiles(filenames: Iterable<string>): void {
    this.assertActive();
    for (const filename of filenames) {
      const normalized = normalizeFile(filename);
      this.sourceFiles.delete(normalized);
      this.diskVersions.delete(normalized);
      this.diskFileExistence.delete(normalized);
      this.diskFileContents.delete(normalized);
      this.boundModules.delete(normalized);
    }
    this.dirty = true;
  }

  dispose(): void {
    this.disposed = true;
    this.overlays.clear();
    this.overlayVersions.clear();
    this.sourceFiles.clear();
    this.diskVersions.clear();
    this.diskFileExistence.clear();
    this.diskFileContents.clear();
    this.boundModules.clear();
    this.diskRoots.clear();
    this.nodeIdentityRoots.clear();
    this.symbolIdentities.clear();
    this.identityKeysByFile.clear();
    this.typeHandles = new WeakMap();
    this.program = undefined;
    this.dirty = false;
  }

  /** Lightweight retained-state counters for hosts and memory regression tests. */
  stats(): ExpressionProjectStats {
    return Object.freeze({
      rebuilds: this.rebuildCount,
      semanticDiagnostics: this.semanticDiagnosticCount,
      overlays: this.overlays.size,
      sourceFiles: this.sourceFiles.size,
      nodeIdentityRoots: this.nodeIdentityRoots.size,
      symbolIdentities: this.symbolIdentities.size
    });
  }

  private assertActive(): void {
    if (this.disposed) throw new ExpressionProjectError([{ code: "EXPR_PROJECT_DISPOSED", message: "This expression project has been disposed", severity: "error", phase: "configuration" }]);
  }

  private rebuild(): void {
    if (!this.dirty && this.program) return;
    this.rebuildCount++;
    // TypeScript types belong to exactly one Program/TypeChecker generation.
    // Clearing these weak handles avoids retaining superseded Programs.
    this.typeHandles = new WeakMap();
    const roots = new Set(this.parsed.fileNames.map(normalizeFile));
    for (const file of this.diskRoots) roots.add(file);
    for (const file of this.overlays.keys()) roots.add(file);
    const started = this.onProfile ? performance.now() : undefined;
    this.program = ts.createProgram({
      rootNames: [...roots],
      options: this.compilerOptions,
      host: this.compilerHost,
      oldProgram: this.program
    });
    if (started !== undefined) {
      this.recordProfile({
        subsystem: "expressions",
        phase: "program",
        elapsedMs: performance.now() - started,
        fileCount: roots.size
      });
    }
    this.dirty = false;
  }

  private setOverlay(filename: string, source: string): boolean {
    if (this.overlays.get(filename) === source) return false;
    this.overlayVersions.set(filename, (this.overlayVersions.get(filename) ?? 0) + 1);
    this.overlays.set(filename, source);
    this.boundModules.delete(filename);
    this.dirty = true;
    return true;
  }

  private readBoundModules(
    filenames: ReadonlyArray<Readonly<{ display: string; canonical: string }>>
  ): ReadonlyMap<string, BoundModule> {
    return new Map(filenames.map(filename => [
      filename.display,
      this.readBoundModule(filename.canonical)
    ]));
  }

  private readBoundModule(filename: string): BoundModule {
    const program = this.program!;
    const sourceFile = program.getSourceFile(filename) ?? program.getSourceFiles().find(file => normalizeFile(file.fileName) === filename);
    if (!sourceFile) throw new ExpressionProjectError([{ code: "EXPR_FILE_MISSING", message: `Module is not part of the expression project: ${filename}`, severity: "error", filename }]);
    const checker = program.getTypeChecker();
    const scopes = new Map<ts.Node, ProjectScope>();
    const symbolVariables = new Map<ts.Symbol, ProjectVariable>();
    const implicitThisVariables = new Map<ts.Node, ProjectVariable>();
    const typeCache = new Map<ts.Type, ExpressionType>();
    const shallowTypeCache = new Map<ts.Type, Map<string, ExpressionType>>();
    // TypeScript formatting is location-sensitive. Keep exact-node variants
    // local to this projection so reuse is safe and no Program is retained.
    const shallowTypeLocationCache = new Map<ts.Type, Map<ts.Node, ExpressionType>>();
    const typeSummaryCache = new Map<ts.Type, Map<ts.Node, ExpressionType>>();
    const typeDisplayCache = new Map<ts.Type, Map<ts.Node, string>>();
    const signatureDisplayCache = new Map<ts.Signature, Map<ts.Node, string>>();
    // Source nodes are immutable for the lifetime of this Program generation.
    const directiveCache = new Map<ts.Node, readonly ExpressionDirective[]>();
    const inlineDirectiveCache = new Map<ts.Node, readonly ExpressionDirective[]>();
    const syntaxStarted = this.onProfile ? performance.now() : undefined;
    const syntacticDiagnostics = program.getSyntacticDiagnostics(sourceFile)
      .map(diagnostic => ({ ...diagnosticFromTs(diagnostic), phase: "syntax" as const }));
    if (syntaxStarted !== undefined) {
      this.recordProfile({
        subsystem: "expressions",
        phase: "syntax-diagnostics",
        elapsedMs: performance.now() - syntaxStarted,
        filename
      });
    }
    const semanticStarted = this.onProfile ? performance.now() : undefined;
    // TypeScript diagnostics must be captured before expression conversion:
    // asking the checker afterwards can reinterpret lazily populated JSX
    // children as ordinary identifiers. Projection into the public diagnostic
    // model remains lazy and no Program is retained by the module.
    const semanticDiagnostics = this.diagnosticMode === "full"
      ? (
          this.semanticDiagnosticCount++,
          program.getSemanticDiagnostics(sourceFile)
      )
      : [];
    if (semanticStarted !== undefined) {
      this.recordProfile({
        subsystem: "expressions",
        phase: "semantic-diagnostics",
        elapsedMs: performance.now() - semanticStarted,
        filename
      });
    }
    const projectionStarted = this.onProfile ? performance.now() : undefined;
    const detailedProfile = this.profileDetail === "detailed" && this.onProfile !== undefined;
    const projectionBuckets = {
      metadata: 0,
      types: 0,
      bindings: 0,
      common: 0,
      specialization: 0
    };
    const projectionCounters = {
      typeCacheHits: 0,
      typeCacheMisses: 0,
      shallowTypeCacheHits: 0,
      shallowTypeCacheMisses: 0,
      checkerTypeQueries: 0,
      checkerSymbolQueries: 0,
      resolvedSignatureQueries: 0,
      directiveScans: 0,
      directiveCharacters: 0
    };
    const measureProjection = <T>(
      bucket: keyof typeof projectionBuckets,
      operation: () => T
    ): T => {
      if (!detailedProfile) return operation();
      const started = performance.now();
      try {
        return operation();
      } finally {
        projectionBuckets[bucket] += performance.now() - started;
      }
    };
    const typeProjectionTimer = new ExclusiveTimer<TypeProjectionBucket>(detailedProfile);
    const displayType = (type: ts.Type, at: ts.Node): string => {
      const locations = typeDisplayCache.get(type);
      const cached = locations?.get(at);
      if (cached !== undefined) return cached;
      const display = typeProjectionTimer.measure(
        "display",
        () => checker.typeToString(type, at, ts.TypeFormatFlags.NoTruncation)
      );
      const target = locations ?? new Map<ts.Node, string>();
      target.set(at, display);
      if (!locations) typeDisplayCache.set(type, target);
      return display;
    };
    const displaySignature = (signature: ts.Signature, at: ts.Node): string => {
      const locations = signatureDisplayCache.get(signature);
      const cached = locations?.get(at);
      if (cached !== undefined) return cached;
      const display = checker.signatureToString(signature, at, ts.TypeFormatFlags.NoTruncation);
      const target = locations ?? new Map<ts.Node, string>();
      target.set(at, display);
      if (!locations) signatureDisplayCache.set(signature, target);
      return display;
    };
    const directivesFor = (node: ts.Node | undefined, inline = false): readonly ExpressionDirective[] => {
      if (!node) return Object.freeze([]);
      const cache = inline ? inlineDirectiveCache : directiveCache;
      const cached = cache.get(node);
      if (cached) return cached;
      const directiveSource = node.getSourceFile();
      const fullStart = node.getFullStart();
      const start = node.getStart(directiveSource, false);
      const segments = start > fullStart
        ? [{ text: directiveSource.text.slice(fullStart, start), start: fullStart }]
        : [];
      if (inline && ts.isVariableDeclaration(node)) {
        const start = node.name.end;
        const end = node.type?.getFullStart() ?? node.initializer?.getFullStart() ?? node.end;
        if (end > start) segments.push({ text: directiveSource.text.slice(start, end), start });
      }
      if (detailedProfile) {
        projectionCounters.directiveScans += segments.length;
        projectionCounters.directiveCharacters += segments.reduce((count, segment) => count + segment.text.length, 0);
      }
      const directives = Object.freeze(uniqueDirectives(segments.flatMap(segment =>
        segment.text.includes("@exact")
          ? parseExpressionDirectives(segment.text, segment.start, directiveSource)
          : []
      )));
      cache.set(node, directives);
      return directives;
    };
    const bindingDirectivesFor = (node: ts.Node | undefined): readonly ExpressionDirective[] => {
      if (!node) return Object.freeze([]);
      const values = [...directivesFor(node, ts.isVariableDeclaration(node))];
      if (ts.isVariableDeclaration(node)
        && ts.isVariableDeclarationList(node.parent)
        && ts.isVariableStatement(node.parent.parent)) {
        values.unshift(...directivesFor(node.parent.parent));
      }
      return Object.freeze(uniqueDirectives(values));
    };
    const typeDirectivesFor = (type: ts.Type): readonly ExpressionDirective[] => {
      const symbol = type.aliasSymbol ?? type.getSymbol();
      return Object.freeze(uniqueDirectives((symbol?.declarations ?? []).flatMap(declaration => directivesFor(declaration))));
    };
    const usedIdentityKeys = new Set<string>();
    const symbolIdentity = (id: string, name: string): ExpressionSymbol => {
      usedIdentityKeys.add(id);
      const existing = this.symbolIdentities.get(id);
      if (existing) return existing;
      const identity = Object.freeze({ id, name });
      this.symbolIdentities.set(id, identity);
      return identity;
    };

    const scopeFor = (node: ts.Node): ProjectScope => {
      let owner: ts.Node | undefined = node;
      while (owner && !isScopeNode(owner)) owner = owner.parent;
      owner ??= sourceFile;
      const existing = scopes.get(owner);
      if (existing) return existing;
      const parent = owner.parent ? scopeFor(owner.parent) : undefined;
      const scope = new ProjectScope(`${filename}:scope:${owner.pos}:${owner.end}:${ts.SyntaxKind[owner.kind]}`, scopeKind(owner), parent === undefined || parent === existing ? undefined : parent);
      scopes.set(owner, scope);
      return scope;
    };

    const typeFor = (type: ts.Type, at: ts.Node): ExpressionType => {
      const cached = typeCache.get(type);
      if (cached) {
        if (detailedProfile) projectionCounters.typeCacheHits++;
        return cached;
      }
      if (detailedProfile) projectionCounters.typeCacheMisses++;
      const display = displayType(type, at);
      const callSignatures = type.getCallSignatures();
      const key = `${filename}:${(type as ts.Type & { id?: number }).id ?? "anonymous"}:${type.flags}:${display}`;
      // Install a cycle breaker before expanding recursive union members.
      const placeholder: ExpressionType = {
        id: `type:${key}`, kind: typeKind(type), display,
        nullable: false, callable: callSignatures.length > 0,
        properties: Object.freeze([]), propertyTypes: Object.freeze([]), unionMembers: Object.freeze([]),
        callSignatures: Object.freeze([]), typeArguments: Object.freeze([]), typeParameters: Object.freeze([])
      };
      typeCache.set(type, placeholder);
      const members = typeProjectionTimer.measure(
        "members",
        () => type.isUnionOrIntersection() ? type.types.map(member => typeFor(member, at)) : []
      );
      const signatures = typeProjectionTimer.measure("signatures", () => callSignatures.map(signature => {
        const declaration = signature.getDeclaration() ?? at;
        return Object.freeze({
          display: displaySignature(signature, at),
          parameters: Object.freeze(signature.getParameters().map(parameter => {
            const parameterDeclaration = parameter.valueDeclaration ?? parameter.declarations?.[0] ?? declaration;
            return Object.freeze({
              name: parameter.name,
              type: typeFor(checker.getTypeOfSymbolAtLocation(parameter, parameterDeclaration), parameterDeclaration),
              optional: Boolean(parameter.flags & ts.SymbolFlags.Optional)
                || ts.isParameter(parameterDeclaration) && (!!parameterDeclaration.questionToken || !!parameterDeclaration.initializer),
              rest: ts.isParameter(parameterDeclaration) && !!parameterDeclaration.dotDotDotToken,
              directives: directivesFor(parameterDeclaration)
            });
          })),
          returnType: typeFor(checker.getReturnTypeOfSignature(signature), declaration),
          typeParameters: Object.freeze((signature.typeParameters ?? []).map(parameter => displayType(parameter, declaration))),
          declarationSource: displayFile(declaration.getSourceFile().fileName),
          directives: directivesFor(declaration),
          returnDirectives: directivesFor(signature.getDeclaration()?.type)
        });
      }));
      const [typeArguments, typeParameters] = typeProjectionTimer.measure("arguments", () => [
        type.flags & ts.TypeFlags.Object && ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference)
          ? checker.getTypeArguments(type as ts.TypeReference).map(argument => typeFor(argument, at))
          : [],
        ((type as ts.Type & { typeParameters?: readonly ts.Type[] }).typeParameters ?? [])
          .map(parameter => checker.typeToString(parameter, at))
      ] as const);
      // Optional parameters are commonly represented as `Options | undefined`.
      // Surface the non-nullish object's properties on that union so callers do
      // not need to understand TypeScript's internal union representation.
      const [properties, propertyTypes] = typeProjectionTimer.measure("properties", () => {
        const properties = type.getNonNullableType().getProperties();
        return [properties, properties.map(property => {
          const declaration = property.valueDeclaration ?? property.declarations?.[0] ?? at;
          return Object.freeze({
            name: property.name,
            type: shallowTypeFor(checker.getTypeOfSymbolAtLocation(property, declaration), declaration),
            optional: Boolean(property.flags & ts.SymbolFlags.Optional),
            readonly: property.declarations?.some(candidate => ts.canHaveModifiers(candidate)
              && ts.getModifiers(candidate)?.some(modifier => modifier.kind === ts.SyntaxKind.ReadonlyKeyword)) ?? false,
            directives: Object.freeze(uniqueDirectives((property.declarations ?? []).flatMap(declaration => directivesFor(declaration))))
          });
        })] as const;
      });
      const typeDirectives = typeProjectionTimer.measure("directives", () => typeDirectivesFor(type));
      const value = typeProjectionTimer.measure("construction", () => new ProjectType(
        `type:${key}`,
        typeKind(type),
        display,
        Boolean(type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown)) || members.some(member => member.nullable),
        callSignatures.length > 0,
        Object.freeze(properties.map(property => property.name)),
        Object.freeze(propertyTypes),
        Object.freeze(members),
        Object.freeze(signatures),
        Object.freeze(typeArguments),
        Object.freeze(typeParameters),
        checker.isTupleType(type) ? "tuple" : checker.isArrayType(type) ? "array" : isReadonlyArrayType(checker, type) ? "readonly-array" : undefined,
        typeDirectives
      ));
      // Recursive members already reference the placeholder. Populate that
      // same identity rather than replacing it with a second object whose
      // recursive edges would remain permanently empty.
      typeProjectionTimer.measure("construction", () => {
        Object.assign(placeholder, value);
        Object.freeze(placeholder);
        this.typeHandles.set(placeholder, type);
      });
      return placeholder;
    };

    const summary = (value: ts.Type, location: ts.Node): ExpressionType => {
      const locations = typeSummaryCache.get(value);
      const cached = locations?.get(location);
      if (cached) return cached;
      const display = displayType(value, location);
      const callSignatures = value.getCallSignatures();
      const properties = value.getProperties();
      const result = typeProjectionTimer.measure("construction", () => Object.freeze({
        id: `type-summary:${value.flags}:${display}`,
        kind: typeKind(value),
        display,
        nullable: Boolean(value.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown)),
        callable: callSignatures.length > 0,
        properties: Object.freeze(properties.map(property => property.name)),
        propertyTypes: Object.freeze([]), unionMembers: Object.freeze([]), callSignatures: Object.freeze([]),
        typeArguments: Object.freeze([]), typeParameters: Object.freeze([])
      }));
      const target = locations ?? new Map<ts.Node, ExpressionType>();
      target.set(location, result);
      if (!locations) typeSummaryCache.set(value, target);
      return result;
    };

    const shallowTypeFor = (type: ts.Type, at: ts.Node): ExpressionType => {
      const locations = shallowTypeLocationCache.get(type);
      const locationCached = locations?.get(at);
      if (locationCached) {
        if (detailedProfile) projectionCounters.shallowTypeCacheHits++;
        return locationCached;
      }
      const display = displayType(type, at);
      const variants = shallowTypeCache.get(type);
      const cached = variants?.get(display);
      if (cached) {
        if (detailedProfile) projectionCounters.shallowTypeCacheHits++;
        const target = locations ?? new Map<ts.Node, ExpressionType>();
        target.set(at, cached);
        if (!locations) shallowTypeLocationCache.set(type, target);
        return cached;
      }
      if (detailedProfile) projectionCounters.shallowTypeCacheMisses++;
      const callSignatures = type.getCallSignatures();
      const properties = type.getProperties();
      const members = typeProjectionTimer.measure("members", () => type.isUnionOrIntersection()
        ? type.types.map(member => summary(member, at))
        : []);
      const signatures = typeProjectionTimer.measure("signatures", () => callSignatures.map(signature => {
        const declaration = signature.getDeclaration() ?? at;
        return Object.freeze({
          display: displaySignature(signature, at),
          parameters: Object.freeze(signature.getParameters().map(parameter => {
            const parameterDeclaration = parameter.valueDeclaration ?? parameter.declarations?.[0] ?? declaration;
            return Object.freeze({
              name: parameter.name,
              type: summary(checker.getTypeOfSymbolAtLocation(parameter, parameterDeclaration), parameterDeclaration),
              optional: Boolean(parameter.flags & ts.SymbolFlags.Optional),
              rest: ts.isParameter(parameterDeclaration) && !!parameterDeclaration.dotDotDotToken,
              directives: directivesFor(parameterDeclaration)
            });
          })),
          returnType: summary(checker.getReturnTypeOfSignature(signature), declaration),
          typeParameters: Object.freeze((signature.typeParameters ?? []).map(parameter => displayType(parameter, declaration))),
          declarationSource: displayFile(declaration.getSourceFile().fileName),
          directives: directivesFor(declaration),
          returnDirectives: directivesFor(signature.getDeclaration()?.type)
        });
      }));
      const value = typeProjectionTimer.measure("construction", () => Object.freeze({
        id: `type-summary:${type.flags}:${display}`,
        kind: typeKind(type),
        display,
        nullable: Boolean(type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown)) || members.some(member => member.nullable),
        callable: callSignatures.length > 0,
        properties: Object.freeze(properties.map(property => property.name)),
        propertyTypes: Object.freeze([]),
        unionMembers: Object.freeze(members),
        callSignatures: Object.freeze(signatures),
        typeArguments: Object.freeze([]),
        typeParameters: Object.freeze([])
      }));
      const target = variants ?? new Map<string, ExpressionType>();
      target.set(display, value);
      if (!variants) shallowTypeCache.set(type, target);
      const locationTarget = locations ?? new Map<ts.Node, ExpressionType>();
      locationTarget.set(at, value);
      if (!locations) shallowTypeLocationCache.set(type, locationTarget);
      return value;
    };

    const variableFor = (identifier: ts.Identifier): Variable | undefined => {
      if (identifier.text === "this" && ts.isParameter(identifier.parent)) return variableForThis(identifier);
      if (detailedProfile) projectionCounters.checkerSymbolQueries++;
      const locatedSymbol = ts.isShorthandPropertyAssignment(identifier.parent) && identifier.parent.name === identifier
        ? checker.getShorthandAssignmentValueSymbol(identifier.parent) ?? checker.getSymbolAtLocation(identifier)
        : checker.getSymbolAtLocation(identifier);
      const symbol = ts.isExportSpecifier(identifier.parent)
        && !identifier.parent.parent.parent.moduleSpecifier
        ? checker.getExportSpecifierLocalTargetSymbol(identifier.parent) ?? locatedSymbol
        : locatedSymbol;
      if (!symbol) return undefined;
      const cached = symbolVariables.get(symbol);
      if (cached) return cached;
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0] ?? identifier;
      const declarationFile = normalizeFile(declaration.getSourceFile().fileName);
      const localName = declarationBindingName(declaration) ?? symbol.name;
      const key = declarationIdentity(
        declarationFile,
        declaration,
        localName,
        this.fileVersion(declarationFile)
      );
      usedIdentityKeys.add(key);
      const scope = scopeFor(declaration);
      let variableType: ExpressionType | undefined;
      try {
        if (detailedProfile) projectionCounters.checkerTypeQueries++;
        variableType = typeFor(checker.getTypeOfSymbolAtLocation(symbol, identifier), identifier);
      } catch { /* TypeScript can reject incomplete error symbols. */ }
      const variable = new ProjectVariable(symbolIdentity(key, localName), localName, ts.SyntaxKind[declaration.kind], scope, isMutableBinding(declaration));
      symbolVariables.set(symbol, variable);
      variable.type = variableType;
      variable.exported = Boolean(symbol.flags & ts.SymbolFlags.ExportValue);
      variable.importedFrom = importSource(declaration);
      variable.typeOnly = isTypeOnlyBinding(declaration);
      variable.directives = bindingDirectivesFor(declaration);
      scope.add(variable);
      Object.freeze(variable);
      return variable;
    };

    const variableForThis = (node: ts.Node): Variable => {
      let owner: ts.Node = sourceFile;
      let declaration: ts.Node | undefined;
      for (let current = node.parent; current; current = current.parent) {
        if (ts.isArrowFunction(current)) continue;
        if (ts.isFunctionLike(current) || ts.isClassLike(current) || ts.isSourceFile(current)) {
          owner = current;
          if (ts.isFunctionLike(current)) {
            declaration = current.parameters.find(candidate => candidate.name.getText(sourceFile) === "this");
          }
          break;
        }
      }
      const existing = implicitThisVariables.get(owner);
      if (existing) return existing;
      const scope = scopeFor(declaration ?? owner);
      const key = declarationIdentity(
        filename,
        declaration ?? owner,
        "this",
        this.fileVersion(filename)
      );
      const variable = new ProjectVariable(
        symbolIdentity(key, "this"),
        "this",
        declaration ? "Parameter" : "ThisKeyword",
        scope,
        !!declaration,
        !declaration
      );
      try {
        if (detailedProfile) projectionCounters.checkerTypeQueries++;
        variable.type = typeFor(checker.getTypeAtLocation(node), node);
      } catch { /* Invalid implicit this types remain unresolved. */ }
      variable.typeOnly = false;
      scope.add(variable);
      Object.freeze(variable);
      implicitThisVariables.set(owner, variable);
      return variable;
    };

    let nodeSequence = 0;
    let convertedNodeCount = 0;
    const identityStarted = detailedProfile ? performance.now() : undefined;
    const priorRoot = this.nodeIdentityRoots.get(filename);
    const retainedNodeIds = priorRoot ? alignNodeIdentities(sourceFile, priorRoot) : new Map<ts.Node, string>();
    const allocatedNodeIds = new Set<string>(priorRoot ? [...walkExpressionNodes(priorRoot)].map(node => node.id) : []);
    const identityElapsed = identityStarted === undefined ? undefined : performance.now() - identityStarted;
    const nodeId = (node: ts.Node, start: number, kind: string): string => {
      const retained = retainedNodeIds.get(node);
      if (retained) return retained;
      const base = `${filename}:node:${start}:${node.end}:${kind}:${nodeSequence++}`;
      if (!allocatedNodeIds.has(base)) {
        allocatedNodeIds.add(base);
        return base;
      }
      const revision = this.overlayVersions.get(filename) ?? 0;
      let suffix = 1;
      let candidate = `${base}:new:${revision}:${suffix}`;
      while (allocatedNodeIds.has(candidate)) candidate = `${base}:new:${revision}:${++suffix}`;
      allocatedNodeIds.add(candidate);
      return candidate;
    };
    const convert = (node: ts.Node): ExpressionNode => {
      convertedNodeCount++;
      const children: ExpressionNode[] = [];
      ts.forEachChild(node, child => {
        children.push(convert(child));
      });
      const metadata = measureProjection("metadata", () => {
        const start = ts.isSourceFile(node) ? 0 : node.getStart(sourceFile, false);
        const line = sourceFile.getLineAndCharacterOfPosition(start);
        return {
          start,
          kind: syntaxKindName(node),
          span: Object.freeze({
            start,
            end: node.end,
            line: line.line + 1,
            column: line.character + 1
          } satisfies SourceSpan)
        };
      });
      const semanticType = measureProjection("types", () => {
        if (!ts.isExpression(node)) return undefined;
        try {
          if (detailedProfile) projectionCounters.checkerTypeQueries++;
          return typeFor(checker.getTypeAtLocation(node), node);
        } catch {
          // Invalid code is represented alongside diagnostics.
          return undefined;
        }
      });
      const variable = measureProjection("bindings", () =>
        ts.isIdentifier(node)
          ? variableFor(node)
          : node.kind === ts.SyntaxKind.ThisKeyword
            ? variableForThis(node)
            : undefined
      );
      const common = measureProjection("common", (): ExpressionNode => ({
        id: nodeId(node, metadata.start, metadata.kind),
        kind: metadata.kind,
        category: category(node),
        span: metadata.span,
        children: Object.freeze(children),
        synthetic: false,
        scope: scopeFor(node),
        type: semanticType,
        variable,
        name: nodeName(node),
        operator: nodeOperator(node),
        directives: bindingDirectivesFor(node)
      }));
      return measureProjection("specialization", () => {
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
          const target = children[0]!;
          const argumentOffset = 1 + (node.typeArguments?.length ?? 0);
          let resolvedSignature: ExpressionCallSignature | undefined;
          if (ts.isCallExpression(node)) {
            if (detailedProfile) projectionCounters.resolvedSignatureQueries++;
            const signature = checker.getResolvedSignature(node);
            if (signature) {
              resolvedSignature = signatureFor(
                signature,
                node,
                checker,
                typeFor,
                directivesFor,
                displayType,
                displaySignature
              );
            }
          }
          return freezeSourceNode({
            ...common,
            target,
            arguments: Object.freeze(children.slice(argumentOffset)),
            ...(resolvedSignature ? { resolvedSignature } : {})
          }, sourceFile.text);
        }
        if (ts.isFunctionLike(node)) {
          const parameters = node.parameters.flatMap(parameter => parameter.name.getText(sourceFile) === "this"
            ? [variableForThis(parameter.name)]
            : collectBindingIdentifiers(parameter.name).map(variableFor).filter((value): value is Variable => !!value));
          return freezeSourceNode({
            ...common,
            parameters: Object.freeze(parameters),
            captures: Object.freeze(functionCaptures(children, common.scope))
          }, sourceFile.text);
        }
        if (ts.isJsxElement(node)) {
          const opening = children[0]!;
          const attributes = opening.children.find(child => child.kind === "JsxAttributes")?.children ?? [];
          return freezeSourceNode({
            ...common,
            tagName: node.openingElement.tagName.getText(sourceFile),
            attributes: Object.freeze(attributes),
            jsxChildren: Object.freeze(children.slice(1, -1))
          }, sourceFile.text);
        }
        if (ts.isJsxSelfClosingElement(node)) {
          const attributes = children.find(child => child.kind === "JsxAttributes")?.children ?? [];
          return freezeSourceNode({
            ...common,
            tagName: node.tagName.getText(sourceFile),
            attributes: Object.freeze(attributes),
            jsxChildren: Object.freeze([])
          }, sourceFile.text);
        }
        if (ts.isJsxFragment(node)) {
          return freezeSourceNode({ ...common, attributes: Object.freeze([]), jsxChildren: Object.freeze(children.slice(1, -1)) }, sourceFile.text);
        }
        if (ts.isJsxAttribute(node) || ts.isJsxSpreadAttribute(node)) {
          return freezeSourceNode({
            ...common,
            name: ts.isJsxAttribute(node) ? node.name.getText(sourceFile) : undefined,
            initializer: children.at(-1)
          }, sourceFile.text);
        }
        return freezeSourceNode(common, sourceFile.text);
      });
    };

    const nodeConversionStarted = detailedProfile ? performance.now() : undefined;
    const root = convert(sourceFile);
    const nodeConversionElapsed = nodeConversionStarted === undefined
      ? undefined
      : performance.now() - nodeConversionStarted;
    const finalizationStarted = detailedProfile ? performance.now() : undefined;
    this.nodeIdentityRoots.set(filename, root);
    for (const scope of scopes.values()) scope.seal();
    const module = createModule({
      filename,
      source: sourceFile.text,
      root,
      state: "bound",
      diagnostics: () => [
        ...syntacticDiagnostics,
        ...semanticDiagnostics.map(diagnostic => ({ ...diagnosticFromTs(diagnostic), phase: "semantic" as const }))
      ]
    });
    const ownUsedIdentityKeys = new Set([...usedIdentityKeys].filter(key => key.startsWith(`${filename}:`)));
    const priorKeys = this.identityKeysByFile.get(filename);
    for (const key of priorKeys ?? []) if (!ownUsedIdentityKeys.has(key)) {
      this.symbolIdentities.delete(key);
    }
    this.identityKeysByFile.set(filename, ownUsedIdentityKeys);
    this.boundModules.set(filename, { program, module });
    const finalizationElapsed = finalizationStarted === undefined
      ? undefined
      : performance.now() - finalizationStarted;
    if (detailedProfile && identityElapsed !== undefined && nodeConversionElapsed !== undefined && finalizationElapsed !== undefined) {
      const detail = { subsystem: "expressions" as const, filename };
      this.recordProfile({ ...detail, phase: "projection-identity", elapsedMs: identityElapsed });
      this.recordProfile({ ...detail, phase: "projection-node-conversion", elapsedMs: nodeConversionElapsed, nodeCount: convertedNodeCount });
      this.recordProfile({ ...detail, phase: "projection-node-metadata", elapsedMs: projectionBuckets.metadata });
      this.recordProfile({
        ...detail,
        phase: "projection-node-types",
        elapsedMs: projectionBuckets.types,
        typeCacheHits: projectionCounters.typeCacheHits,
        typeCacheMisses: projectionCounters.typeCacheMisses,
        shallowTypeCacheHits: projectionCounters.shallowTypeCacheHits,
        shallowTypeCacheMisses: projectionCounters.shallowTypeCacheMisses,
        checkerTypeQueries: projectionCounters.checkerTypeQueries
      });
      this.recordProfile({
        ...detail,
        phase: "projection-node-bindings",
        elapsedMs: projectionBuckets.bindings,
        checkerSymbolQueries: projectionCounters.checkerSymbolQueries,
        symbolCount: symbolVariables.size
      });
      this.recordProfile({
        ...detail,
        phase: "projection-node-common",
        elapsedMs: projectionBuckets.common,
        directiveScans: projectionCounters.directiveScans,
        directiveCharacters: projectionCounters.directiveCharacters,
        scopeCount: scopes.size
      });
      this.recordProfile({
        ...detail,
        phase: "projection-node-specialization",
        elapsedMs: projectionBuckets.specialization,
        resolvedSignatureQueries: projectionCounters.resolvedSignatureQueries
      });
      const measuredNodeWork = Object.values(projectionBuckets).reduce((total, elapsed) => total + elapsed, 0);
      this.recordProfile({
        ...detail,
        phase: "projection-node-overhead",
        elapsedMs: Math.max(0, nodeConversionElapsed - measuredNodeWork)
      });
      this.recordProfile({ ...detail, phase: "projection-finalization", elapsedMs: finalizationElapsed });
      const typePhases = {
        "projection-type-display": "display",
        "projection-type-members": "members",
        "projection-type-signatures": "signatures",
        "projection-type-properties": "properties",
        "projection-type-arguments": "arguments",
        "projection-type-directives": "directives",
        "projection-type-construction": "construction"
      } as const;
      for (const [phase, bucket] of Object.entries(typePhases) as Array<
        [keyof typeof typePhases, TypeProjectionBucket]
      >) {
        this.recordProfile({
          ...detail,
          phase,
          elapsedMs: typeProjectionTimer.elapsed(bucket)
        });
      }
    }
    if (projectionStarted !== undefined) {
      this.recordProfile({
        subsystem: "expressions",
        phase: "module-projection",
        elapsedMs: performance.now() - projectionStarted,
        filename,
        nodeCount: convertedNodeCount,
        typeCount: typeCache.size,
        shallowTypeCount: [...shallowTypeCache.values()].reduce((count, variants) => count + variants.size, 0),
        symbolCount: symbolVariables.size,
        scopeCount: scopes.size
      });
    }
    return module;
  }

  /** Emits one immutable profiling observation when instrumentation is enabled. */
  private recordProfile(event: ExpressionProjectProfileEvent): void {
    this.onProfile?.(Object.freeze(event));
  }

  private fileVersion(filename: string): string {
    const overlay = this.overlayVersions.get(filename);
    if (overlay !== undefined) return overlay.toString();
    const cached = this.diskVersions.get(filename);
    if (cached) return cached;
    const version = diskFileVersion(filename);
    this.diskVersions.set(filename, version);
    return version;
  }
}

const sourceTextByNode = new WeakMap<ExpressionNode, string>();

function sourceNodeText(this: ExpressionNode): string | undefined {
  const source = sourceTextByNode.get(this);
  const span = this.span;
  return source !== undefined && span ? source.slice(span.start, span.end) : undefined;
}

function freezeSourceNode<T extends ExpressionNode>(node: T, source: string): T {
  sourceTextByNode.set(node, source);
  Object.defineProperty(node, "text", {
    configurable: false,
    enumerable: true,
    get: sourceNodeText
  });
  return Object.freeze(node);
}

function functionCaptures(children: readonly ExpressionNode[], functionScope: ExpressionScope): Variable[] {
  const captures = new Set<Variable>();
  const visit = (node: ExpressionNode, parent?: ExpressionNode): void => {
    if (node.variable && (node.kind === "Identifier" || node.kind === "ThisKeyword")
      && !scopeDescendsFrom(node.variable.scope, functionScope)
      && !isBindingPosition(node, parent)) captures.add(node.variable);
    for (const child of node.children) visit(child, node);
  };
  for (const child of children) visit(child);
  return [...captures];
}

function scopeDescendsFrom(scope: ExpressionScope, ancestor: ExpressionScope): boolean {
  for (let cursor: ExpressionScope | undefined = scope; cursor; cursor = cursor.parent) {
    if (cursor.id === ancestor.id) return true;
  }
  return false;
}

function isBindingPosition(node: ExpressionNode, parent?: ExpressionNode): boolean {
  if (!parent || parent.children[0] !== node) return false;
  return parent.category === "declaration" || parent.category === "pattern"
    || parent.kind === "Parameter" || parent.kind.startsWith("Import");
}

function syntaxKindName(node: ts.Node): string {
  if (ts.isNumericLiteral(node)) return "NumericLiteral";
  if (ts.isBigIntLiteral(node)) return "BigIntLiteral";
  if (ts.isStringLiteral(node)) return "StringLiteral";
  if (ts.isNoSubstitutionTemplateLiteral(node)) return "NoSubstitutionTemplateLiteral";
  if (ts.isRegularExpressionLiteral(node)) return "RegularExpressionLiteral";
  if (ts.isJsxText(node)) return "JsxText";
  return ts.SyntaxKind[node.kind];
}

/**
 * Retains package-owned node handles by structural correspondence. Source
 * offsets remain provenance only: inserting an unrelated sibling must not
 * re-key the nodes that follow it during watch/HMR rebinding.
 */
function alignNodeIdentities(sourceFile: ts.SourceFile, priorRoot: ExpressionNode): Map<ts.Node, string> {
  const identities = new Map<ts.Node, string>();
  const previousSource = priorRoot.text ?? "";
  const nextSource = sourceFile.text;
  let commonPrefix = 0;
  while (commonPrefix < previousSource.length && commonPrefix < nextSource.length
    && previousSource.charCodeAt(commonPrefix) === nextSource.charCodeAt(commonPrefix)) commonPrefix++;
  let commonSuffix = 0;
  while (commonSuffix < previousSource.length - commonPrefix && commonSuffix < nextSource.length - commonPrefix
    && previousSource.charCodeAt(previousSource.length - commonSuffix - 1) === nextSource.charCodeAt(nextSource.length - commonSuffix - 1)) commonSuffix++;
  const offsetDelta = nextSource.length - previousSource.length;
  const syntaxShapeCache = new WeakMap<ts.Node, string>();
  const expressionShapeCache = new WeakMap<ExpressionNode, string>();
  const syntaxChildren = (node: ts.Node): ts.Node[] => {
    const children: ts.Node[] = [];
    ts.forEachChild(node, child => { children.push(child); });
    return children;
  };
  const syntaxShallow = (node: ts.Node): string => {
    const children = syntaxChildren(node);
    const leaf = children.length ? "" : sourceFile.text.slice(node.getStart(sourceFile, false), node.end);
    return `${syntaxKindName(node)}\0${nodeName(node) ?? ""}\0${nodeOperator(node) ?? ""}\0${leaf}`;
  };
  const expressionShallow = (node: ExpressionNode): string => {
    const leaf = node.children.length ? "" : node.text ?? "";
    return `${node.kind}\0${node.name ?? ""}\0${node.operator ?? ""}\0${leaf}`;
  };
  const syntaxAnchor = (node: ts.Node): string => {
    const start = node.getStart(sourceFile, false);
    if (node.end <= commonPrefix) return `before:${start}:${node.end}:${syntaxKindName(node)}`;
    if (start >= nextSource.length - commonSuffix) return `after:${start - offsetDelta}:${node.end - offsetDelta}:${syntaxKindName(node)}`;
    return "";
  };
  const expressionAnchor = (node: ExpressionNode): string => {
    const span = node.span;
    if (!span) return "";
    if (span.end <= commonPrefix) return `before:${span.start}:${span.end}:${node.kind}`;
    if (span.start >= previousSource.length - commonSuffix) return `after:${span.start}:${span.end}:${node.kind}`;
    return "";
  };
  const syntaxShape = (node: ts.Node): string => {
    const cached = syntaxShapeCache.get(node);
    if (cached) return cached;
    let left = 0x811c9dc5;
    let right = 0x9e3779b9;
    const mix = (value: string) => {
      for (let index = 0; index < value.length; index++) {
        left = Math.imul(left ^ value.charCodeAt(index), 0x01000193);
        right = Math.imul(right ^ value.charCodeAt(index), 0x85ebca6b);
      }
    };
    mix(syntaxShallow(node));
    const children = syntaxChildren(node);
    for (const child of children) mix(syntaxShape(child));
    const value = `${syntaxKindName(node)}:${children.length}:${left >>> 0}:${right >>> 0}`;
    syntaxShapeCache.set(node, value);
    return value;
  };
  const expressionShape = (node: ExpressionNode): string => {
    const cached = expressionShapeCache.get(node);
    if (cached) return cached;
    let left = 0x811c9dc5;
    let right = 0x9e3779b9;
    const mix = (value: string) => {
      for (let index = 0; index < value.length; index++) {
        left = Math.imul(left ^ value.charCodeAt(index), 0x01000193);
        right = Math.imul(right ^ value.charCodeAt(index), 0x85ebca6b);
      }
    };
    mix(expressionShallow(node));
    for (const child of node.children) mix(expressionShape(child));
    const value = `${node.kind}:${node.children.length}:${left >>> 0}:${right >>> 0}`;
    expressionShapeCache.set(node, value);
    return value;
  };
  const pairBy = <T, U>(
    next: readonly T[], previous: readonly U[], pairedNext: Set<number>, pairedPrevious: Set<number>,
    nextKey: (value: T) => string, previousKey: (value: U) => string
  ): Array<readonly [number, number]> => {
    const queues = new Map<string, number[]>();
    previous.forEach((value, index) => {
      if (pairedPrevious.has(index)) return;
      const key = previousKey(value);
      if (!key) return;
      const queue = queues.get(key) ?? [];
      queue.push(index);
      queues.set(key, queue);
    });
    const pairs: Array<readonly [number, number]> = [];
    next.forEach((value, index) => {
      if (pairedNext.has(index)) return;
      const key = nextKey(value);
      if (!key) return;
      const queue = queues.get(key);
      const previousIndex = queue?.shift();
      if (previousIndex === undefined) return;
      pairedNext.add(index);
      pairedPrevious.add(previousIndex);
      pairs.push([index, previousIndex]);
    });
    return pairs;
  };
  const align = (next: ts.Node, previous: ExpressionNode): void => {
    if (syntaxKindName(next) !== previous.kind) return;
    identities.set(next, previous.id);
    const nextChildren = syntaxChildren(next);
    const previousChildren = previous.children;
    const pairedNext = new Set<number>();
    const pairedPrevious = new Set<number>();
    const anchored = pairBy(nextChildren, previousChildren, pairedNext, pairedPrevious, syntaxAnchor, expressionAnchor);
    const exact = pairBy(nextChildren, previousChildren, pairedNext, pairedPrevious, syntaxShape, expressionShape);
    const compatible = pairBy(nextChildren, previousChildren, pairedNext, pairedPrevious, syntaxShallow, expressionShallow);
    for (const [nextIndex, previousIndex] of [...anchored, ...exact, ...compatible]) {
      align(nextChildren[nextIndex]!, previousChildren[previousIndex]!);
    }
  };
  align(sourceFile, priorRoot);
  return identities;
}

function* walkExpressionNodes(root: ExpressionNode): Iterable<ExpressionNode> {
  yield root;
  for (const child of root.children) yield* walkExpressionNodes(child);
}

function declarationIdentity(filename: string, declaration: ts.Node, name: string, revision: string): string {
  const scopes: string[] = [];
  let cursor = declaration.parent;
  while (cursor && !ts.isSourceFile(cursor)) {
    if (ts.isFunctionLike(cursor) || ts.isClassLike(cursor) || ts.isModuleDeclaration(cursor) || ts.isBlock(cursor) || ts.isCaseBlock(cursor) || ts.isCatchClause(cursor)) {
      const named = hasNodeName(cursor) && cursor.name ? cursor.name.getText() : undefined;
      const functionBody = ts.isBlock(cursor) && ts.isFunctionLike(cursor.parent)
        && "body" in cursor.parent && cursor.parent.body === cursor;
      scopes.push(named
        ? `${ts.SyntaxKind[cursor.kind]}:${named}`
        : functionBody
          ? "Block:function-body"
          : `${ts.SyntaxKind[cursor.kind]}:${scopeShape(cursor)}#${structuralOrdinal(cursor)}`
            + (hasAmbiguousScopePeer(cursor) ? `@${revision}` : ""));
    }
    cursor = cursor.parent;
  }
  return `${filename}:${scopes.reverse().join("/")}:${ts.SyntaxKind[declaration.kind]}#${declarationOrdinal(declaration, name)}:${name}`;
}

const indexedIdentityOwners = new WeakSet<ts.Node>();
const structuralOrdinals = new WeakMap<ts.Node, number>();
const ambiguousIdentityScopes = new WeakSet<ts.Node>();

function structuralOrdinal(node: ts.Node): number {
  const owner = nearestIdentityScope(node.parent);
  if (!owner) return 0;
  indexIdentityScopes(owner);
  return structuralOrdinals.get(node) ?? 0;
}

function hasAmbiguousScopePeer(node: ts.Node): boolean {
  const owner = nearestIdentityScope(node.parent);
  if (!owner) return false;
  indexIdentityScopes(owner);
  return ambiguousIdentityScopes.has(node);
}

function indexIdentityScopes(owner: ts.Node): void {
  if (indexedIdentityOwners.has(owner)) return;
  indexedIdentityOwners.add(owner);
  const groups = new Map<string, ts.Node[]>();
  walkIdentityScopes(owner, candidate => {
    const key = `${candidate.kind}:${scopeShape(candidate)}`;
    let group = groups.get(key);
    if (!group) groups.set(key, group = []);
    structuralOrdinals.set(candidate, group.length);
    group.push(candidate);
    return true;
  });
  for (const group of groups.values()) {
    if (new Set(group.map(node => node.parent)).size > 1) {
      for (const node of group) ambiguousIdentityScopes.add(node);
    }
  }
}

function walkIdentityScopes(owner: ts.Node, visit: (node: ts.Node) => boolean): void {
  const walk = (node: ts.Node): boolean => {
    if (node !== owner && isIdentityScope(node)) {
      if (!visit(node)) return false;
      if (ts.isFunctionLike(node) || ts.isClassLike(node) || ts.isModuleDeclaration(node)) return true;
    }
    for (const child of node.getChildren()) if (!walk(child)) return false;
    return true;
  };
  walk(owner);
}

function isIdentityScope(node: ts.Node): boolean {
  return ts.isFunctionLike(node) || ts.isClassLike(node) || ts.isModuleDeclaration(node)
    || ts.isBlock(node) || ts.isCaseBlock(node) || ts.isCatchClause(node);
}

function scopeShape(node: ts.Node): string {
  const bindings: string[] = [];
  node.forEachChild(child => {
    if (ts.isVariableStatement(child)) {
      for (const declaration of child.declarationList.declarations) {
        bindings.push(`${ts.SyntaxKind[declaration.kind]}:${declaration.name.getText()}`);
      }
    } else if ((ts.isFunctionDeclaration(child) || ts.isClassDeclaration(child)) && child.name) {
      bindings.push(`${ts.SyntaxKind[child.kind]}:${child.name.text}`);
    }
  });
  return `${ts.SyntaxKind[node.parent?.kind ?? ts.SyntaxKind.Unknown]}:${fingerprint(bindings.join("|"))}`;
}

function declarationOrdinal(declaration: ts.Node, _name: string): number {
  const owner = nearestIdentityScope(declaration.parent);
  if (!owner) return 0;
  indexDeclarationOrdinals(owner);
  return declarationOrdinals.get(declaration) ?? 0;
}

const indexedDeclarationOwners = new WeakSet<ts.Node>();
const declarationOrdinals = new WeakMap<ts.Node, number>();

function indexDeclarationOrdinals(owner: ts.Node): void {
  if (indexedDeclarationOwners.has(owner)) return;
  indexedDeclarationOwners.add(owner);
  const counts = new Map<string, number>();
  const visit = (node: ts.Node): void => {
    if (node !== owner && (ts.isFunctionLike(node) || ts.isClassLike(node))) return;
    const name = declarationBindingName(node);
    if (name !== undefined) {
      const key = `${node.kind}\0${name}\0${fingerprint(node.getText().replace(/\s+/g, " "))}`;
      const ordinal = counts.get(key) ?? 0;
      declarationOrdinals.set(node, ordinal);
      counts.set(key, ordinal + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(owner);
}

function nearestIdentityScope(node: ts.Node | undefined): ts.Node | undefined {
  for (let cursor = node; cursor; cursor = cursor.parent) {
    if (ts.isSourceFile(cursor) || ts.isFunctionLike(cursor) || ts.isClassLike(cursor) || ts.isBlock(cursor)
      || ts.isCaseBlock(cursor) || ts.isCatchClause(cursor) || ts.isModuleBlock(cursor)) return cursor;
  }
  return undefined;
}

function diskFileVersion(filename: string): string {
  try {
    const stat = fs.statSync(filename, { bigint: true });
    return `disk:${stat.mtimeNs}:${stat.ctimeNs}:${stat.size}`;
  } catch {
    return "disk:missing";
  }
}

function signatureFor(
  signature: ts.Signature,
  at: ts.Node,
  checker: ts.TypeChecker,
  typeFor: (type: ts.Type, at: ts.Node) => ExpressionType,
  directivesFor: (node: ts.Node | undefined, inline?: boolean) => readonly ExpressionDirective[],
  displayType: (type: ts.Type, at: ts.Node) => string,
  displaySignature: (signature: ts.Signature, at: ts.Node) => string
): ExpressionCallSignature {
  const declaration = signature.getDeclaration() ?? at;
  return Object.freeze({
    display: displaySignature(signature, at),
    parameters: Object.freeze(signature.getParameters().map((parameter, index) => {
      const parameterDeclaration = parameter.valueDeclaration ?? parameter.declarations?.[0] ?? declaration;
      const contextual = ts.isCallExpression(at) && at.arguments[index]
        ? checker.getContextualType(at.arguments[index]!)
        : undefined;
      return Object.freeze({
        name: parameter.name,
        type: typeFor(contextual ?? checker.getTypeOfSymbolAtLocation(parameter, at), at),
        optional: Boolean(parameter.flags & ts.SymbolFlags.Optional)
          || ts.isParameter(parameterDeclaration) && (!!parameterDeclaration.questionToken || !!parameterDeclaration.initializer),
        rest: ts.isParameter(parameterDeclaration) && !!parameterDeclaration.dotDotDotToken,
        directives: directivesFor(parameterDeclaration)
      });
    })),
    returnType: typeFor(checker.getReturnTypeOfSignature(signature), declaration),
    typeParameters: Object.freeze((signature.typeParameters ?? []).map(parameter => displayType(parameter, declaration))),
    declarationSource: displayFile(declaration.getSourceFile().fileName),
    directives: directivesFor(declaration),
    returnDirectives: directivesFor(signature.getDeclaration()?.type)
  });
}

function parseExpressionDirectives(text: string, offset: number, sourceFile: ts.SourceFile): ExpressionDirective[] {
  const directives: ExpressionDirective[] = [];
  const marker = /@([A-Za-z_$][\w$-]*)\b([^\r\n*]*)/g;
  for (let match = marker.exec(text); match; match = marker.exec(text)) {
    const namespace = match[1]!;
    if (namespace !== "exact") continue;
    const body = match[2] ?? "";
    const token = /([A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$-]*)?)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([A-Za-z_$][\w$]*)))?/g;
    for (let item = token.exec(body); item; item = token.exec(body)) {
      const start = offset + match.index + match[0].indexOf(body) + item.index;
      const line = sourceFile.getLineAndCharacterOfPosition(Math.max(0, start));
      directives.push(Object.freeze({
        namespace,
        key: item[1]!,
        ...(item[2] ?? item[3] ?? item[4] ? { value: item[2] ?? item[3] ?? item[4] } : {}),
        span: Object.freeze({ start, end: start + item[0].length, line: line.line + 1, column: line.character + 1 })
      }));
    }
  }
  return directives;
}

function uniqueDirectives(values: readonly ExpressionDirective[]): ExpressionDirective[] {
  return [...new Map(values.map(value => [`${value.span?.start ?? -1}:${value.key}:${value.value ?? ""}`, value])).values()];
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isReadonlyArrayType(checker: ts.TypeChecker, type: ts.Type): boolean {
  const symbol = type.aliasSymbol ?? type.getSymbol();
  if (symbol?.name === "ReadonlyArray") return true;
  return checker.typeToString(type).startsWith("readonly ") && Boolean(type.flags & ts.TypeFlags.Object);
}

export function createExpressionProject(options: ExpressionProjectOptions = {}): ExpressionProject {
  return new ExpressionProject(options);
}

/** Finds the nearest usable project configuration without exposing TypeScript. */
export function findExpressionConfig(cwd: string): string | undefined {
  return ts.findConfigFile(path.resolve(cwd), ts.sys.fileExists, "tsconfig.json");
}

function normalizeFile(filename: string): string {
  const normalized = displayFile(filename);
  return ts.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase();
}

function displayFile(filename: string): string {
  return path.resolve(filename).replace(/\\/g, "/");
}

function scriptKind(filename: string): ts.ScriptKind {
  if (filename.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filename.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(filename)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function isScopeNode(node: ts.Node): boolean {
  return ts.isSourceFile(node) || ts.isFunctionLike(node) || ts.isClassLike(node) || ts.isBlock(node)
    || ts.isModuleBlock(node) || ts.isCaseBlock(node) || ts.isCatchClause(node);
}

function scopeKind(node: ts.Node): ScopeKind {
  if (ts.isSourceFile(node) || ts.isModuleBlock(node)) return "module";
  if (ts.isFunctionLike(node)) return "function";
  if (ts.isClassLike(node)) return "class";
  if (ts.isCatchClause(node)) return "catch";
  return "block";
}

function category(node: ts.Node): NodeCategory {
  if (ts.isSourceFile(node)) return "module";
  if (isJsxNode(node)) return "jsx";
  if (ts.isTypeNode(node)) return "type";
  if (isDeclarationNode(node)) return "declaration";
  if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node) || ts.isBindingElement(node)) return "pattern";
  if (ts.isStatement(node)) return "statement";
  if (ts.isExpression(node)) return "expression";
  return "token";
}

function isJsxNode(node: ts.Node): boolean {
  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)
    || ts.isJsxExpression(node) || ts.isJsxAttribute(node) || ts.isJsxAttributes(node)
    || ts.isJsxOpeningElement(node) || ts.isJsxClosingElement(node) || ts.isJsxOpeningFragment(node)
    || ts.isJsxClosingFragment(node) || ts.isJsxSpreadAttribute(node) || ts.isJsxText(node);
}

function nodeName(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isJsxText(node)) return node.text;
  if (ts.isPropertyAccessExpression(node) || ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) return node.name.getText();
  if (ts.isElementAccessExpression(node) && (ts.isStringLiteralLike(node.argumentExpression) || ts.isNumericLiteral(node.argumentExpression))) return node.argumentExpression.text;
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxClosingElement(node)) return node.tagName.getText();
  if (hasNodeName(node) && node.name) return node.name.getText();
  return undefined;
}

function isDeclarationNode(node: ts.Node): boolean {
  return ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
    || ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isParameter(node)
    || ts.isImportDeclaration(node) || ts.isImportSpecifier(node) || ts.isNamespaceImport(node)
    || ts.isExportDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)
    || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
    || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeParameterDeclaration(node);
}

function hasNodeName(node: ts.Node): node is ts.Node & { name: ts.DeclarationName } {
  return "name" in node;
}

function nodeOperator(node: ts.Node): string | undefined {
  if (ts.isBinaryExpression(node)) return node.operatorToken.getText();
  if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) return ts.tokenToString(node.operator);
  return undefined;
}

function collectBindingIdentifiers(name: ts.BindingName): ts.Identifier[] {
  if (ts.isIdentifier(name)) return [name];
  return name.elements.flatMap(element => ts.isOmittedExpression(element) ? [] : collectBindingIdentifiers(element.name));
}

function declarationBindingName(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (hasNodeName(node) && node.name && ts.isIdentifier(node.name)) return node.name.text;
  return undefined;
}

function isMutableBinding(node: ts.Node): boolean {
  if (ts.isParameter(node)) return node.name.getText() !== "this";
  if (ts.isBindingElement(node)) return isMutableBinding(node.parent.parent);
  if (ts.isVariableDeclaration(node)) {
    const declarations = node.parent;
    return ts.isVariableDeclarationList(declarations) && (declarations.flags & ts.NodeFlags.Const) === 0;
  }
  return false;
}

function importSource(node: ts.Node): string | undefined {
  let cursor: ts.Node | undefined = node;
  while (cursor && !ts.isImportDeclaration(cursor)) cursor = cursor.parent;
  return cursor && ts.isStringLiteral(cursor.moduleSpecifier) ? cursor.moduleSpecifier.text : undefined;
}

function isTypeOnlyBinding(node: ts.Node): boolean {
  let cursor: ts.Node | undefined = node;
  while (cursor && !ts.isImportDeclaration(cursor)) {
    if (ts.isImportSpecifier(cursor) && cursor.isTypeOnly) return true;
    cursor = cursor.parent;
  }
  return !!cursor?.importClause?.isTypeOnly;
}

function typeKind(type: ts.Type): ExpressionTypeKind {
  const flags = type.flags;
  if (flags & ts.TypeFlags.Any) return "any";
  if (flags & ts.TypeFlags.Unknown) return "unknown";
  if (flags & ts.TypeFlags.Never) return "never";
  if (flags & ts.TypeFlags.Void) return "void";
  if (flags & ts.TypeFlags.Undefined) return "undefined";
  if (flags & ts.TypeFlags.Null) return "null";
  if (flags & ts.TypeFlags.BooleanLike) return "boolean";
  if (flags & ts.TypeFlags.NumberLike) return "number";
  if (flags & ts.TypeFlags.BigIntLike) return "bigint";
  if (flags & ts.TypeFlags.StringLike) return "string";
  if (flags & ts.TypeFlags.ESSymbolLike) return "symbol";
  if (flags & ts.TypeFlags.Union) return "union";
  if (flags & ts.TypeFlags.Intersection) return "intersection";
  if (flags & ts.TypeFlags.TypeParameter) return "type-parameter";
  return type.getCallSignatures().length ? "function" : "object";
}

function diagnosticFromTs(diagnostic: ts.Diagnostic): ExpressionDiagnostic {
  const source = diagnostic.file;
  const start = diagnostic.start;
  let span: SourceSpan | undefined;
  if (source && start !== undefined) {
    const line = source.getLineAndCharacterOfPosition(start);
    span = Object.freeze({ start, end: start + (diagnostic.length ?? 0), line: line.line + 1, column: line.character + 1 });
  }
  return Object.freeze({
    code: `TS${diagnostic.code}`,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    severity: diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning",
    ...(source ? { filename: normalizeFile(source.fileName) } : {}),
    ...(span ? { span } : {})
  });
}
