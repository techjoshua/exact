import type { ExactProfileSink } from '@exactjs/instrumentation';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import type { ExpressionNode, ExpressionSymbol, ExpressionType } from './model.js';
import { createModule, type BoundModule, type UnboundModule } from './module.js';
import type {
	ExpressionProjectOptions,
	ExpressionProjectProfileEvent,
	ExpressionProjectStats
} from './project/contracts.js';
export type {
	ExpressionProjectOptions,
	ExpressionProjectProfileEvent,
	ExpressionProjectStats
} from './project/contracts.js';
import { ExpressionProjectError } from './project/errors.js';
import { diskFileVersion } from './project/filesystem.js';
import { createExpressionProjectHost } from './project/host.js';
import { projectExpressionModule } from './project/projection-session.js';
import { displayFile, normalizeFile } from './project/syntax.js';

export { ExpressionProjectError } from './project/errors.js';

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
		this.onProfile = options.onProfile;
		const host = createExpressionProjectHost(options, {
			overlays: this.overlays,
			overlayVersions: this.overlayVersions,
			diskVersions: this.diskVersions,
			diskFileExistence: this.diskFileExistence,
			diskFileContents: this.diskFileContents,
			sourceFiles: this.sourceFiles
		});
		this.tsconfigPath = host.tsconfigPath;
		this.parsed = host.parsed;
		this.forceModuleDetection = host.forceModuleDetection;
		this.diagnosticMode = host.diagnosticMode;
		this.profileDetail = host.profileDetail;
		this.compilerOptions = host.compilerOptions;
		this.moduleResolutionCache = host.moduleResolutionCache;
		this.compilerHost = host.compilerHost;
		this.configuredRoots = host.configuredRoots;
	}

	/** Applies a module to the owned runtime state for this expression project instance. */
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

	/** Applies a modules to the owned runtime state for this expression project instance. */
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

	/** Resolves a module for this expression project instance. */
	getModule(filename: string, source?: string): BoundModule {
		this.assertActive();
		const normalized = normalizeFile(filename);
		if (source !== undefined) return this.updateModule(normalized, source);
		if (!this.program || this.dirty) this.rebuild();
		return this.readBoundModule(normalized);
	}

	/** Performs the bind domain operation for this expression project instance. */
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

	/** Produces an emit in its external representation for this expression project instance. */
	emit(module: BoundModule, options: Parameters<BoundModule['emit']>[0] = {}) {
		const errors = module.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
		if (errors.length) throw new ExpressionProjectError(errors);
		return module.emit(options);
	}

	/** Reports whether assignable for this expression project instance. */
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

	/** Releases resources owned by this expression project instance. */
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
		const module = projectExpressionModule({
			program,
			filename,
			diagnosticMode: this.diagnosticMode,
			profileEnabled: this.onProfile !== undefined,
			profileDetail: this.profileDetail,
			recordProfile: (event) => this.recordProfile(event),
			recordSemanticDiagnostics: () => {
				this.semanticDiagnosticCount++;
			},
			nodeIdentityRoots: this.nodeIdentityRoots,
			overlayVersions: this.overlayVersions,
			typeHandles: this.typeHandles,
			symbolIdentities: this.symbolIdentities,
			identityKeysByFile: this.identityKeysByFile,
			fileVersion: (candidate) => this.fileVersion(candidate)
		});
		this.boundModules.set(filename, { program, module });
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

/** Creates an expression project. */
export function createExpressionProject(options: ExpressionProjectOptions = {}): ExpressionProject {
	return new ExpressionProject(options);
}

/** Finds the nearest usable project configuration without exposing TypeScript. */
export function findExpressionConfig(cwd: string): string | undefined {
	return ts.findConfigFile(path.resolve(cwd), ts.sys.fileExists, 'tsconfig.json');
}
