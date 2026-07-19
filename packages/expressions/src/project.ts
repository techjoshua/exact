import type { ExactProfileSink } from '@exact/instrumentation';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import type {
	ExpressionCallSignature,
	ExpressionDiagnostic,
	ExpressionDirective,
	ExpressionNode,
	ExpressionSymbol,
	ExpressionType,
	SourceSpan,
	Variable
} from './model.js';
import { createModule, type BoundModule, type UnboundModule } from './module.js';
import { ExclusiveTimer } from './profiling.js';
import type {
	ExpressionProjectOptions,
	ExpressionProjectProfileEvent,
	ExpressionProjectStats,
	TypeProjectionBucket
} from './project/contracts.js';
import { ProjectScope, ProjectType, ProjectVariable } from './project/projection-model.js';
export type {
	ExpressionProjectOptions,
	ExpressionProjectProfileEvent,
	ExpressionProjectStats
} from './project/contracts.js';
import { parseExpressionDirectives, uniqueDirectives } from './project/directives.js';
import { diskFileVersion } from './project/filesystem.js';
import {
	alignNodeIdentities,
	declarationIdentity,
	functionCaptures,
	syntaxKindName,
	walkExpressionNodes
} from './project/identity.js';
import { isReadonlyArrayType, signatureFor } from './project/signatures.js';
import { freezeSourceNode } from './project/source-nodes.js';
import {
	category,
	collectBindingIdentifiers,
	declarationBindingName,
	diagnosticFromTs,
	displayFile,
	importSource,
	isMutableBinding,
	isScopeNode,
	isTypeOnlyBinding,
	nodeName,
	nodeOperator,
	normalizeFile,
	scopeKind,
	scriptKind,
	typeKind
} from './project/syntax.js';

export class ExpressionProjectError extends Error {
	constructor(readonly diagnostics: readonly ExpressionDiagnostic[]) {
		super(diagnostics.map(formatExpressionDiagnostic).join('\n'));
		this.name = 'ExpressionProjectError';
	}
}

function formatExpressionDiagnostic(diagnostic: ExpressionDiagnostic): string {
	const location = diagnostic.filename
		? `${diagnostic.filename}${diagnostic.span ? `:${diagnostic.span.line}:${diagnostic.span.column}` : ''}`
		: diagnostic.span
			? `${diagnostic.span.line}:${diagnostic.span.column}`
			: undefined;
	return `${location ? `${location} - ` : ''}${diagnostic.code}: ${diagnostic.message}`;
}

/** Project-aware TypeScript bridge. No TypeScript compiler objects escape this class. */
export class ExpressionProject {
	readonly tsconfigPath: string;
	private readonly parsed: ts.ParsedCommandLine;
	private readonly forceModuleDetection: boolean;
	private readonly diagnosticMode: 'syntax' | 'full';
	private readonly onProfile?: ExactProfileSink<ExpressionProjectProfileEvent>;
	private readonly profileDetail: 'summary' | 'detailed';
	private readonly compilerOptions: ts.CompilerOptions;
	private readonly compilerHost: ts.CompilerHost;
	private readonly moduleResolutionCache: ts.ModuleResolutionCache;
	private readonly overlays = new Map<string, string>();
	private readonly overlayVersions = new Map<string, number>();
	private readonly diskVersions = new Map<string, string>();
	private readonly diskFileExistence = new Map<string, boolean>();
	private readonly diskFileContents = new Map<string, string | undefined>();
	private readonly sourceFiles = new Map<
		string,
		Readonly<{ version: string; sourceFile: ts.SourceFile }>
	>();
	private readonly boundModules = new Map<
		string,
		Readonly<{ program: ts.Program; module: BoundModule }>
	>();
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
		this.profileDetail = options.profileDetail ?? 'summary';
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
		this.tsconfigPath = config;
		this.forceModuleDetection = options.forceModuleDetection ?? false;
		this.diagnosticMode = options.diagnostics ?? 'full';
		const read = ts.readConfigFile(config, ts.sys.readFile);
		if (read.error)
			throw new ExpressionProjectError([
				{ ...diagnosticFromTs(read.error), phase: 'configuration' }
			]);
		this.parsed = ts.parseJsonConfigFileContent(
			read.config,
			ts.sys,
			path.dirname(config),
			undefined,
			config
		);
		if (this.parsed.errors.length)
			throw new ExpressionProjectError(
				this.parsed.errors.map((error) => ({
					...diagnosticFromTs(error),
					phase: 'configuration' as const
				}))
			);
		this.configuredRoots = new Set(this.parsed.fileNames.map(normalizeFile));
		this.compilerOptions = {
			...this.parsed.options,
			// JavaScript modules are part of the supported runtime grammar even when
			// a project's normal typecheck excludes them.
			allowJs: true,
			checkJs: this.parsed.options.checkJs ?? false,
			moduleDetection: this.forceModuleDetection
				? ts.ModuleDetectionKind.Force
				: this.parsed.options.moduleDetection
		};
		this.moduleResolutionCache = ts.createModuleResolutionCache(
			path.dirname(config),
			ts.sys.useCaseSensitiveFileNames ? (value) => value : (value) => value.toLowerCase(),
			this.compilerOptions
		);
		const base = ts.createCompilerHost(this.compilerOptions, true);
		this.compilerHost = {
			...base,
			fileExists: (file) => {
				const normalized = normalizeFile(file);
				if (this.overlays.has(normalized)) return true;
				const cached = this.diskFileExistence.get(normalized);
				if (cached !== undefined) return cached;
				const exists = base.fileExists(file);
				this.diskFileExistence.set(normalized, exists);
				return exists;
			},
			readFile: (file) => {
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
					const created = ts.createSourceFile(
						file,
						source,
						languageVersion,
						true,
						scriptKind(file)
					) as ts.SourceFile & { version?: string };
					created.version = version;
					this.sourceFiles.set(normalized, { version, sourceFile: created });
					return created;
				}
				const version = this.diskVersions.get(normalized) ?? diskFileVersion(normalized);
				this.diskVersions.set(normalized, version);
				const cached = this.sourceFiles.get(normalized);
				if (cached?.version === version) return cached.sourceFile;
				const created = base.getSourceFile(
					file,
					languageVersion,
					onError,
					shouldCreateNewSourceFile
				);
				if (created) {
					(created as ts.SourceFile & { version?: string }).version = version;
					this.sourceFiles.set(normalized, { version, sourceFile: created });
				}
				return created;
			}
		};
		if (configurationStarted !== undefined) {
			this.recordProfile({
				subsystem: 'expressions',
				phase: 'configuration',
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
		if (!changed && !this.dirty && this.program && cached?.program === this.program)
			return cached.module;
		this.rebuild();
		return this.readBoundModule(normalized);
	}

	updateModules(
		entries: Iterable<readonly [filename: string, source: string]>
	): ReadonlyMap<string, BoundModule> {
		const filenames: Array<Readonly<{ display: string; canonical: string }>> = [];
		let changed = false;
		for (const [filename, source] of entries) {
			const normalized = normalizeFile(filename);
			filenames.push({ display: displayFile(filename), canonical: normalized });
			changed = this.setOverlay(normalized, source) || changed;
		}
		if (!changed && !this.dirty && this.program) {
			const cached = filenames.map(
				(filename) => [filename, this.boundModules.get(filename.canonical)] as const
			);
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
		const structuralErrors = module
			.validate()
			.filter((diagnostic) => diagnostic.severity === 'error');
		if (structuralErrors.length) throw new ExpressionProjectError(structuralErrors);
		const emitted = module.emit({ format: 'generated' }).code;
		const bound = this.updateModule(module.filename, emitted);
		if (!module.provenance) return bound;
		return createModule({
			filename: bound.filename,
			source: bound.source,
			root: bound.rootNode,
			state: 'bound',
			diagnostics: bound.diagnostics,
			trivia: bound.trivia,
			provenance: module.provenance
		});
	}

	emit(module: BoundModule, options: Parameters<BoundModule['emit']>[0] = {}) {
		const errors = module.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
		if (errors.length) throw new ExpressionProjectError(errors);
		return module.emit(options);
	}

	isAssignable(source: ExpressionType, target: ExpressionType): boolean {
		const sourceHandle = this.typeHandles.get(source);
		const targetHandle = this.typeHandles.get(target);
		if (sourceHandle && targetHandle && this.program) {
			return this.program.getTypeChecker().isTypeAssignableTo(sourceHandle, targetHandle);
		}
		if (
			source.id === target.id ||
			target.kind === 'any' ||
			target.kind === 'unknown' ||
			source.kind === 'never'
		)
			return true;
		if (target.kind === 'union')
			return target.unionMembers.some((member) => this.isAssignable(source, member));
		if (source.kind === 'union')
			return source.unionMembers.every((member) => this.isAssignable(member, target));
		return source.display === target.display;
	}

	/** Resolves a runtime import using this project's exact TypeScript configuration. */
	resolveModuleSpecifier(specifier: string, containingFile: string): string | undefined {
		this.assertActive();
		const resolved = ts.resolveModuleName(
			specifier,
			containingFile,
			this.parsed.options,
			{
				...ts.sys,
				fileExists: (file) => this.overlays.has(normalizeFile(file)) || ts.sys.fileExists(file),
				readFile: (file) => this.overlays.get(normalizeFile(file)) ?? ts.sys.readFile(file)
			},
			this.moduleResolutionCache
		).resolvedModule;
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
		if (this.disposed)
			throw new ExpressionProjectError([
				{
					code: 'EXPR_PROJECT_DISPOSED',
					message: 'This expression project has been disposed',
					severity: 'error',
					phase: 'configuration'
				}
			]);
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
				subsystem: 'expressions',
				phase: 'program',
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
		return new Map(
			filenames.map((filename) => [filename.display, this.readBoundModule(filename.canonical)])
		);
	}

	private readBoundModule(filename: string): BoundModule {
		const program = this.program!;
		const sourceFile =
			program.getSourceFile(filename) ??
			program.getSourceFiles().find((file) => normalizeFile(file.fileName) === filename);
		if (!sourceFile)
			throw new ExpressionProjectError([
				{
					code: 'EXPR_FILE_MISSING',
					message: `Module is not part of the expression project: ${filename}`,
					severity: 'error',
					filename
				}
			]);
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
		const syntacticDiagnostics = program
			.getSyntacticDiagnostics(sourceFile)
			.map((diagnostic) => ({ ...diagnosticFromTs(diagnostic), phase: 'syntax' as const }));
		if (syntaxStarted !== undefined) {
			this.recordProfile({
				subsystem: 'expressions',
				phase: 'syntax-diagnostics',
				elapsedMs: performance.now() - syntaxStarted,
				filename
			});
		}
		const semanticStarted = this.onProfile ? performance.now() : undefined;
		// TypeScript diagnostics must be captured before expression conversion:
		// asking the checker afterwards can reinterpret lazily populated JSX
		// children as ordinary identifiers. Projection into the public diagnostic
		// model remains lazy and no Program is retained by the module.
		const semanticDiagnostics =
			this.diagnosticMode === 'full'
				? (this.semanticDiagnosticCount++, program.getSemanticDiagnostics(sourceFile))
				: [];
		if (semanticStarted !== undefined) {
			this.recordProfile({
				subsystem: 'expressions',
				phase: 'semantic-diagnostics',
				elapsedMs: performance.now() - semanticStarted,
				filename
			});
		}
		const projectionStarted = this.onProfile ? performance.now() : undefined;
		const detailedProfile = this.profileDetail === 'detailed' && this.onProfile !== undefined;
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
			const display = typeProjectionTimer.measure('display', () =>
				checker.typeToString(type, at, ts.TypeFormatFlags.NoTruncation)
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
		const directivesFor = (
			node: ts.Node | undefined,
			inline = false
		): readonly ExpressionDirective[] => {
			if (!node) return Object.freeze([]);
			const cache = inline ? inlineDirectiveCache : directiveCache;
			const cached = cache.get(node);
			if (cached) return cached;
			const directiveSource = node.getSourceFile();
			const fullStart = node.getFullStart();
			const start = node.getStart(directiveSource, false);
			const segments =
				start > fullStart
					? [{ text: directiveSource.text.slice(fullStart, start), start: fullStart }]
					: [];
			if (inline && ts.isVariableDeclaration(node)) {
				const start = node.name.end;
				const end = node.type?.getFullStart() ?? node.initializer?.getFullStart() ?? node.end;
				if (end > start) segments.push({ text: directiveSource.text.slice(start, end), start });
			}
			if (detailedProfile) {
				projectionCounters.directiveScans += segments.length;
				projectionCounters.directiveCharacters += segments.reduce(
					(count, segment) => count + segment.text.length,
					0
				);
			}
			const directives = Object.freeze(
				uniqueDirectives(
					segments.flatMap((segment) =>
						segment.text.includes('@exact')
							? parseExpressionDirectives(segment.text, segment.start, directiveSource)
							: []
					)
				)
			);
			cache.set(node, directives);
			return directives;
		};
		const bindingDirectivesFor = (node: ts.Node | undefined): readonly ExpressionDirective[] => {
			if (!node) return Object.freeze([]);
			const values = [...directivesFor(node, ts.isVariableDeclaration(node))];
			if (
				ts.isVariableDeclaration(node) &&
				ts.isVariableDeclarationList(node.parent) &&
				ts.isVariableStatement(node.parent.parent)
			) {
				values.unshift(...directivesFor(node.parent.parent));
			}
			return Object.freeze(uniqueDirectives(values));
		};
		const typeDirectivesFor = (type: ts.Type): readonly ExpressionDirective[] => {
			const symbol = type.aliasSymbol ?? type.getSymbol();
			return Object.freeze(
				uniqueDirectives(
					(symbol?.declarations ?? []).flatMap((declaration) => directivesFor(declaration))
				)
			);
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
			const scope = new ProjectScope(
				`${filename}:scope:${owner.pos}:${owner.end}:${ts.SyntaxKind[owner.kind]}`,
				scopeKind(owner),
				parent === undefined || parent === existing ? undefined : parent
			);
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
			const key = `${filename}:${(type as ts.Type & { id?: number }).id ?? 'anonymous'}:${type.flags}:${display}`;
			// Install a cycle breaker before expanding recursive union members.
			const placeholder: ExpressionType = {
				id: `type:${key}`,
				kind: typeKind(type),
				display,
				nullable: false,
				callable: callSignatures.length > 0,
				properties: Object.freeze([]),
				propertyTypes: Object.freeze([]),
				unionMembers: Object.freeze([]),
				callSignatures: Object.freeze([]),
				typeArguments: Object.freeze([]),
				typeParameters: Object.freeze([])
			};
			typeCache.set(type, placeholder);
			const members = typeProjectionTimer.measure('members', () =>
				type.isUnionOrIntersection() ? type.types.map((member) => typeFor(member, at)) : []
			);
			const signatures = typeProjectionTimer.measure('signatures', () =>
				callSignatures.map((signature) => {
					const declaration = signature.getDeclaration() ?? at;
					return Object.freeze({
						display: displaySignature(signature, at),
						parameters: Object.freeze(
							signature.getParameters().map((parameter) => {
								const parameterDeclaration =
									parameter.valueDeclaration ?? parameter.declarations?.[0] ?? declaration;
								return Object.freeze({
									name: parameter.name,
									type: typeFor(
										checker.getTypeOfSymbolAtLocation(parameter, parameterDeclaration),
										parameterDeclaration
									),
									optional:
										Boolean(parameter.flags & ts.SymbolFlags.Optional) ||
										(ts.isParameter(parameterDeclaration) &&
											(!!parameterDeclaration.questionToken || !!parameterDeclaration.initializer)),
									rest:
										ts.isParameter(parameterDeclaration) && !!parameterDeclaration.dotDotDotToken,
									directives: directivesFor(parameterDeclaration)
								});
							})
						),
						returnType: typeFor(checker.getReturnTypeOfSignature(signature), declaration),
						typeParameters: Object.freeze(
							(signature.typeParameters ?? []).map((parameter) =>
								displayType(parameter, declaration)
							)
						),
						declarationSource: displayFile(declaration.getSourceFile().fileName),
						directives: directivesFor(declaration),
						returnDirectives: directivesFor(signature.getDeclaration()?.type)
					});
				})
			);
			const [typeArguments, typeParameters] = typeProjectionTimer.measure(
				'arguments',
				() =>
					[
						type.flags & ts.TypeFlags.Object &&
						(type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference
							? checker
									.getTypeArguments(type as ts.TypeReference)
									.map((argument) => typeFor(argument, at))
							: [],
						((type as ts.Type & { typeParameters?: readonly ts.Type[] }).typeParameters ?? []).map(
							(parameter) => checker.typeToString(parameter, at)
						)
					] as const
			);
			// Optional parameters are commonly represented as `Options | undefined`.
			// Surface the non-nullish object's properties on that union so callers do
			// not need to understand TypeScript's internal union representation.
			const [properties, propertyTypes] = typeProjectionTimer.measure('properties', () => {
				const properties = type.getNonNullableType().getProperties();
				return [
					properties,
					properties.map((property) => {
						const declaration = property.valueDeclaration ?? property.declarations?.[0] ?? at;
						return Object.freeze({
							name: property.name,
							type: shallowTypeFor(
								checker.getTypeOfSymbolAtLocation(property, declaration),
								declaration
							),
							optional: Boolean(property.flags & ts.SymbolFlags.Optional),
							readonly:
								property.declarations?.some(
									(candidate) =>
										ts.canHaveModifiers(candidate) &&
										ts
											.getModifiers(candidate)
											?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword)
								) ?? false,
							directives: Object.freeze(
								uniqueDirectives(
									(property.declarations ?? []).flatMap((declaration) => directivesFor(declaration))
								)
							)
						});
					})
				] as const;
			});
			const typeDirectives = typeProjectionTimer.measure('directives', () =>
				typeDirectivesFor(type)
			);
			const value = typeProjectionTimer.measure(
				'construction',
				() =>
					new ProjectType(
						`type:${key}`,
						typeKind(type),
						display,
						Boolean(
							type.flags &
								(ts.TypeFlags.Null |
									ts.TypeFlags.Undefined |
									ts.TypeFlags.Any |
									ts.TypeFlags.Unknown)
						) || members.some((member) => member.nullable),
						callSignatures.length > 0,
						Object.freeze(properties.map((property) => property.name)),
						Object.freeze(propertyTypes),
						Object.freeze(members),
						Object.freeze(signatures),
						Object.freeze(typeArguments),
						Object.freeze(typeParameters),
						checker.isTupleType(type)
							? 'tuple'
							: checker.isArrayType(type)
								? 'array'
								: isReadonlyArrayType(checker, type)
									? 'readonly-array'
									: undefined,
						typeDirectives
					)
			);
			// Recursive members already reference the placeholder. Populate that
			// same identity rather than replacing it with a second object whose
			// recursive edges would remain permanently empty.
			typeProjectionTimer.measure('construction', () => {
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
			const result = typeProjectionTimer.measure('construction', () =>
				Object.freeze({
					id: `type-summary:${value.flags}:${display}`,
					kind: typeKind(value),
					display,
					nullable: Boolean(
						value.flags &
							(ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown)
					),
					callable: callSignatures.length > 0,
					properties: Object.freeze(properties.map((property) => property.name)),
					propertyTypes: Object.freeze([]),
					unionMembers: Object.freeze([]),
					callSignatures: Object.freeze([]),
					typeArguments: Object.freeze([]),
					typeParameters: Object.freeze([])
				})
			);
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
			const members = typeProjectionTimer.measure('members', () =>
				type.isUnionOrIntersection() ? type.types.map((member) => summary(member, at)) : []
			);
			const signatures = typeProjectionTimer.measure('signatures', () =>
				callSignatures.map((signature) => {
					const declaration = signature.getDeclaration() ?? at;
					return Object.freeze({
						display: displaySignature(signature, at),
						parameters: Object.freeze(
							signature.getParameters().map((parameter) => {
								const parameterDeclaration =
									parameter.valueDeclaration ?? parameter.declarations?.[0] ?? declaration;
								return Object.freeze({
									name: parameter.name,
									type: summary(
										checker.getTypeOfSymbolAtLocation(parameter, parameterDeclaration),
										parameterDeclaration
									),
									optional: Boolean(parameter.flags & ts.SymbolFlags.Optional),
									rest:
										ts.isParameter(parameterDeclaration) && !!parameterDeclaration.dotDotDotToken,
									directives: directivesFor(parameterDeclaration)
								});
							})
						),
						returnType: summary(checker.getReturnTypeOfSignature(signature), declaration),
						typeParameters: Object.freeze(
							(signature.typeParameters ?? []).map((parameter) =>
								displayType(parameter, declaration)
							)
						),
						declarationSource: displayFile(declaration.getSourceFile().fileName),
						directives: directivesFor(declaration),
						returnDirectives: directivesFor(signature.getDeclaration()?.type)
					});
				})
			);
			const value = typeProjectionTimer.measure('construction', () =>
				Object.freeze({
					id: `type-summary:${type.flags}:${display}`,
					kind: typeKind(type),
					display,
					nullable:
						Boolean(
							type.flags &
								(ts.TypeFlags.Null |
									ts.TypeFlags.Undefined |
									ts.TypeFlags.Any |
									ts.TypeFlags.Unknown)
						) || members.some((member) => member.nullable),
					callable: callSignatures.length > 0,
					properties: Object.freeze(properties.map((property) => property.name)),
					propertyTypes: Object.freeze([]),
					unionMembers: Object.freeze(members),
					callSignatures: Object.freeze(signatures),
					typeArguments: Object.freeze([]),
					typeParameters: Object.freeze([])
				})
			);
			const target = variants ?? new Map<string, ExpressionType>();
			target.set(display, value);
			if (!variants) shallowTypeCache.set(type, target);
			const locationTarget = locations ?? new Map<ts.Node, ExpressionType>();
			locationTarget.set(at, value);
			if (!locations) shallowTypeLocationCache.set(type, locationTarget);
			return value;
		};

		const variableFor = (identifier: ts.Identifier): Variable | undefined => {
			if (identifier.text === 'this' && ts.isParameter(identifier.parent))
				return variableForThis(identifier);
			if (detailedProfile) projectionCounters.checkerSymbolQueries++;
			const locatedSymbol =
				ts.isShorthandPropertyAssignment(identifier.parent) && identifier.parent.name === identifier
					? (checker.getShorthandAssignmentValueSymbol(identifier.parent) ??
						checker.getSymbolAtLocation(identifier))
					: checker.getSymbolAtLocation(identifier);
			const symbol =
				ts.isExportSpecifier(identifier.parent) && !identifier.parent.parent.parent.moduleSpecifier
					? (checker.getExportSpecifierLocalTargetSymbol(identifier.parent) ?? locatedSymbol)
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
			} catch {
				/* TypeScript can reject incomplete error symbols. */
			}
			const variable = new ProjectVariable(
				symbolIdentity(key, localName),
				localName,
				ts.SyntaxKind[declaration.kind],
				scope,
				isMutableBinding(declaration)
			);
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
						declaration = current.parameters.find(
							(candidate) => candidate.name.getText(sourceFile) === 'this'
						);
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
				'this',
				this.fileVersion(filename)
			);
			const variable = new ProjectVariable(
				symbolIdentity(key, 'this'),
				'this',
				declaration ? 'Parameter' : 'ThisKeyword',
				scope,
				!!declaration,
				!declaration
			);
			try {
				if (detailedProfile) projectionCounters.checkerTypeQueries++;
				variable.type = typeFor(checker.getTypeAtLocation(node), node);
			} catch {
				/* Invalid implicit this types remain unresolved. */
			}
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
		const retainedNodeIds = priorRoot
			? alignNodeIdentities(sourceFile, priorRoot)
			: new Map<ts.Node, string>();
		const allocatedNodeIds = new Set<string>(
			priorRoot ? [...walkExpressionNodes(priorRoot)].map((node) => node.id) : []
		);
		const identityElapsed =
			identityStarted === undefined ? undefined : performance.now() - identityStarted;
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
			ts.forEachChild(node, (child) => {
				children.push(convert(child));
			});
			const metadata = measureProjection('metadata', () => {
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
			const semanticType = measureProjection('types', () => {
				if (!ts.isExpression(node)) return undefined;
				try {
					if (detailedProfile) projectionCounters.checkerTypeQueries++;
					return typeFor(checker.getTypeAtLocation(node), node);
				} catch {
					// Invalid code is represented alongside diagnostics.
					return undefined;
				}
			});
			const variable = measureProjection('bindings', () =>
				ts.isIdentifier(node)
					? variableFor(node)
					: node.kind === ts.SyntaxKind.ThisKeyword
						? variableForThis(node)
						: undefined
			);
			const common = measureProjection(
				'common',
				(): ExpressionNode => ({
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
				})
			);
			return measureProjection('specialization', () => {
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
					return freezeSourceNode(
						{
							...common,
							target,
							arguments: Object.freeze(children.slice(argumentOffset)),
							...(resolvedSignature ? { resolvedSignature } : {})
						},
						sourceFile.text
					);
				}
				if (ts.isFunctionLike(node)) {
					const parameters = node.parameters.flatMap((parameter) =>
						parameter.name.getText(sourceFile) === 'this'
							? [variableForThis(parameter.name)]
							: collectBindingIdentifiers(parameter.name)
									.map(variableFor)
									.filter((value): value is Variable => !!value)
					);
					return freezeSourceNode(
						{
							...common,
							parameters: Object.freeze(parameters),
							captures: Object.freeze(functionCaptures(children, common.scope))
						},
						sourceFile.text
					);
				}
				if (ts.isJsxElement(node)) {
					const opening = children[0]!;
					const attributes =
						opening.children.find((child) => child.kind === 'JsxAttributes')?.children ?? [];
					return freezeSourceNode(
						{
							...common,
							tagName: node.openingElement.tagName.getText(sourceFile),
							attributes: Object.freeze(attributes),
							jsxChildren: Object.freeze(children.slice(1, -1))
						},
						sourceFile.text
					);
				}
				if (ts.isJsxSelfClosingElement(node)) {
					const attributes =
						children.find((child) => child.kind === 'JsxAttributes')?.children ?? [];
					return freezeSourceNode(
						{
							...common,
							tagName: node.tagName.getText(sourceFile),
							attributes: Object.freeze(attributes),
							jsxChildren: Object.freeze([])
						},
						sourceFile.text
					);
				}
				if (ts.isJsxFragment(node)) {
					return freezeSourceNode(
						{
							...common,
							attributes: Object.freeze([]),
							jsxChildren: Object.freeze(children.slice(1, -1))
						},
						sourceFile.text
					);
				}
				if (ts.isJsxAttribute(node) || ts.isJsxSpreadAttribute(node)) {
					return freezeSourceNode(
						{
							...common,
							name: ts.isJsxAttribute(node) ? node.name.getText(sourceFile) : undefined,
							initializer: children.at(-1)
						},
						sourceFile.text
					);
				}
				return freezeSourceNode(common, sourceFile.text);
			});
		};

		const nodeConversionStarted = detailedProfile ? performance.now() : undefined;
		const root = convert(sourceFile);
		const nodeConversionElapsed =
			nodeConversionStarted === undefined ? undefined : performance.now() - nodeConversionStarted;
		const finalizationStarted = detailedProfile ? performance.now() : undefined;
		this.nodeIdentityRoots.set(filename, root);
		for (const scope of scopes.values()) scope.seal();
		const module = createModule({
			filename,
			source: sourceFile.text,
			root,
			state: 'bound',
			diagnostics: () => [
				...syntacticDiagnostics,
				...semanticDiagnostics.map((diagnostic) => ({
					...diagnosticFromTs(diagnostic),
					phase: 'semantic' as const
				}))
			]
		});
		const ownUsedIdentityKeys = new Set(
			[...usedIdentityKeys].filter((key) => key.startsWith(`${filename}:`))
		);
		const priorKeys = this.identityKeysByFile.get(filename);
		for (const key of priorKeys ?? [])
			if (!ownUsedIdentityKeys.has(key)) {
				this.symbolIdentities.delete(key);
			}
		this.identityKeysByFile.set(filename, ownUsedIdentityKeys);
		this.boundModules.set(filename, { program, module });
		const finalizationElapsed =
			finalizationStarted === undefined ? undefined : performance.now() - finalizationStarted;
		if (
			detailedProfile &&
			identityElapsed !== undefined &&
			nodeConversionElapsed !== undefined &&
			finalizationElapsed !== undefined
		) {
			const detail = { subsystem: 'expressions' as const, filename };
			this.recordProfile({ ...detail, phase: 'projection-identity', elapsedMs: identityElapsed });
			this.recordProfile({
				...detail,
				phase: 'projection-node-conversion',
				elapsedMs: nodeConversionElapsed,
				nodeCount: convertedNodeCount
			});
			this.recordProfile({
				...detail,
				phase: 'projection-node-metadata',
				elapsedMs: projectionBuckets.metadata
			});
			this.recordProfile({
				...detail,
				phase: 'projection-node-types',
				elapsedMs: projectionBuckets.types,
				typeCacheHits: projectionCounters.typeCacheHits,
				typeCacheMisses: projectionCounters.typeCacheMisses,
				shallowTypeCacheHits: projectionCounters.shallowTypeCacheHits,
				shallowTypeCacheMisses: projectionCounters.shallowTypeCacheMisses,
				checkerTypeQueries: projectionCounters.checkerTypeQueries
			});
			this.recordProfile({
				...detail,
				phase: 'projection-node-bindings',
				elapsedMs: projectionBuckets.bindings,
				checkerSymbolQueries: projectionCounters.checkerSymbolQueries,
				symbolCount: symbolVariables.size
			});
			this.recordProfile({
				...detail,
				phase: 'projection-node-common',
				elapsedMs: projectionBuckets.common,
				directiveScans: projectionCounters.directiveScans,
				directiveCharacters: projectionCounters.directiveCharacters,
				scopeCount: scopes.size
			});
			this.recordProfile({
				...detail,
				phase: 'projection-node-specialization',
				elapsedMs: projectionBuckets.specialization,
				resolvedSignatureQueries: projectionCounters.resolvedSignatureQueries
			});
			const measuredNodeWork = Object.values(projectionBuckets).reduce(
				(total, elapsed) => total + elapsed,
				0
			);
			this.recordProfile({
				...detail,
				phase: 'projection-node-overhead',
				elapsedMs: Math.max(0, nodeConversionElapsed - measuredNodeWork)
			});
			this.recordProfile({
				...detail,
				phase: 'projection-finalization',
				elapsedMs: finalizationElapsed
			});
			const typePhases = {
				'projection-type-display': 'display',
				'projection-type-members': 'members',
				'projection-type-signatures': 'signatures',
				'projection-type-properties': 'properties',
				'projection-type-arguments': 'arguments',
				'projection-type-directives': 'directives',
				'projection-type-construction': 'construction'
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
				subsystem: 'expressions',
				phase: 'module-projection',
				elapsedMs: performance.now() - projectionStarted,
				filename,
				nodeCount: convertedNodeCount,
				typeCount: typeCache.size,
				shallowTypeCount: [...shallowTypeCache.values()].reduce(
					(count, variants) => count + variants.size,
					0
				),
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

export function createExpressionProject(options: ExpressionProjectOptions = {}): ExpressionProject {
	return new ExpressionProject(options);
}

/** Finds the nearest usable project configuration without exposing TypeScript. */
export function findExpressionConfig(cwd: string): string | undefined {
	return ts.findConfigFile(path.resolve(cwd), ts.sys.fileExists, 'tsconfig.json');
}
