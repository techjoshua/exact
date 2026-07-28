import type { ExactProfileSink } from '@exactjs/instrumentation';
import type {
	API as NativeAPI,
	Snapshot as NativeSnapshot
} from '@typescript/native/unstable/sync';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type ts from 'typescript';
import type { ExpressionNode, ExpressionSymbol, ExpressionType } from '../model.js';
import type { BoundModule, UnboundModule } from '../module.js';
import type { ExpressionProjectBackend } from './backend.js';
import type {
	ExpressionProjectOptions,
	ExpressionProjectProfileEvent,
	ExpressionProjectStats
} from './contracts.js';
import { initializeNativeProject } from './native-initialization.js';
import { projectNativeExpressionModule } from './native-module-projection.js';
import type { NativeProjectionCompatibility } from './native-compatibility.js';
import {
	bindNativeModule,
	emitNativeModule,
	applyNativeOverlay,
	assertNativeModulePresent,
	assertNativeProjectActive,
	isNativeAssignable,
	nativeConfigSource,
	nativeFileVersion,
	nativeProjectFailure,
	resolveNativeModuleSpecifier,
	setNativeConfigRoots
} from './native-operations.js';
import { advanceNativeSnapshot, type NativeChangeKind } from './native-snapshots.js';
import { displayFile, normalizeFile } from './syntax.js';

/**
 * TypeScript 7 native semantic backend.
 *
 * One native process and one current immutable snapshot are owned for the
 * lifetime of this project. Projected modules contain only eXact-owned values.
 */
export class NativeExpressionProject implements ExpressionProjectBackend {
	readonly semanticBackend = 'native' as const;
	readonly tsconfigPath: string;
	private readonly nativeTsconfigPath: string;
	private readonly diagnosticMode: 'syntax' | 'full';
	private readonly onProfile?: ExactProfileSink<ExpressionProjectProfileEvent>;
	private readonly profileDetail: 'summary' | 'detailed';
	private readonly compilerOptions: ts.CompilerOptions;
	private readonly moduleResolutionCache: ts.ModuleResolutionCache;
	private readonly overlays = new Map<string, string>();
	private readonly overlayVersions = new Map<string, number>();
	private readonly nativeFilenames = new Map<string, string>();
	private readonly diskVersions = new Map<string, string>();
	private readonly diskFileExistence = new Map<string, boolean>();
	private readonly diskFileContents = new Map<string, string | undefined>();
	private readonly configuredRoots: ReadonlySet<string>;
	private readonly diskRoots = new Set<string>();
	private readonly activeNativeRoots = new Set<string>();
	private readonly removedRoots = new Set<string>();
	private readonly openFiles = new Set<string>();
	private readonly pendingOpenFiles = new Set<string>();
	private readonly pendingCloseFiles = new Set<string>();
	private readonly pendingChanges = new Map<string, NativeChangeKind>();
	private readonly boundModules = new Map<
		string,
		Readonly<{ snapshotId: number; module: BoundModule }>
	>();
	private readonly nodeIdentityRoots = new Map<string, ExpressionNode>();
	private readonly symbolIdentities = new Map<string, ExpressionSymbol>();
	private readonly identityKeysByFile = new Map<string, Set<string>>();
	private readonly native: NativeAPI;
	private typeHandles = new WeakMap<ExpressionType, ts.Type>();
	private compatibility?: NativeProjectionCompatibility;
	private snapshot?: NativeSnapshot;
	private dirty = true;
	private rebuildCount = 0;
	private semanticDiagnosticCount = 0;
	private snapshotCount = 0;
	private disposed = false;

	constructor(options: ExpressionProjectOptions = {}) {
		this.onProfile = options.onProfile;
		const initialized = initializeNativeProject(options, {
			overlays: this.overlays,
			overlayVersions: this.overlayVersions,
			diskVersions: this.diskVersions,
			diskFileExistence: this.diskFileExistence,
			diskFileContents: this.diskFileContents,
			pendingChanges: this.pendingChanges,
			nativeConfigSource: () => this.nativeConfigSource()
		});
		const host = initialized.host;
		this.tsconfigPath = host.tsconfigPath;
		this.nativeTsconfigPath = initialized.nativeTsconfigPath;
		this.nativeFilenames.set(
			normalizeFile(this.nativeTsconfigPath),
			displayFile(this.nativeTsconfigPath)
		);
		this.diagnosticMode = host.diagnosticMode;
		this.profileDetail = host.profileDetail;
		this.compilerOptions = host.compilerOptions;
		this.moduleResolutionCache = host.moduleResolutionCache;
		this.configuredRoots = host.configuredRoots;
		this.native = initialized.native;
	}

	/** Applies one in-memory source and returns its immutable expression module. */
	updateModule(filename: string, source: string): BoundModule {
		return this.updateModules([[filename, source]]).get(displayFile(filename))!;
	}

	/** Applies a source transaction and advances the native snapshot once. */
	updateModules(
		entries: Iterable<readonly [filename: string, source: string]>
	): ReadonlyMap<string, BoundModule> {
		this.assertActive();
		const requested: Array<Readonly<{ display: string; canonical: string }>> = [];
		let changed = false;
		for (const [filename, source] of entries) {
			const canonical = normalizeFile(filename);
			this.nativeFilenames.set(canonical, displayFile(path.resolve(filename)));
			requested.push({ display: displayFile(filename), canonical });
			changed = this.setOverlay(canonical, source) || changed;
		}
		changed = this.setActiveNativeRoots(requested.map((file) => file.canonical)) || changed;
		if (!changed && !this.dirty && this.snapshot) {
			const cached = requested.map(
				(file) => [file, this.boundModules.get(file.canonical)] as const
			);
			if (cached.every(([, entry]) => entry?.snapshotId === this.snapshot!.id))
				return new Map(cached.map(([file, entry]) => [file.display, entry!.module]));
		}
		this.rebuild();
		return new Map(requested.map((file) => [file.display, this.readBoundModule(file.canonical)]));
	}

	/** Loads one disk-backed source as an open native project file. */
	loadModule(filename: string): BoundModule {
		return this.loadModules([filename]).get(displayFile(filename))!;
	}

	/** Loads disk-backed sources and advances the native snapshot once. */
	loadModules(filenames: Iterable<string>): ReadonlyMap<string, BoundModule> {
		this.assertActive();
		const requested: Array<Readonly<{ display: string; canonical: string }>> = [];
		for (const filename of filenames) {
			const canonical = normalizeFile(filename);
			this.nativeFilenames.set(canonical, displayFile(path.resolve(filename)));
			requested.push({ display: displayFile(filename), canonical });
			if (!this.configuredRoots.has(canonical) && !this.diskRoots.has(canonical)) {
				this.diskRoots.add(canonical);
				this.removedRoots.delete(canonical);
				if (!this.openFiles.has(canonical)) this.pendingOpenFiles.add(canonical);
				this.openFiles.add(canonical);
				this.pendingChanges.set(canonical, 'changed');
				this.pendingChanges.set(normalizeFile(this.nativeTsconfigPath), 'changed');
				this.dirty = true;
			}
		}
		this.setActiveNativeRoots(requested.map((file) => file.canonical));
		this.rebuild();
		return new Map(requested.map((file) => [file.display, this.readBoundModule(file.canonical)]));
	}

	/** Returns a current module, optionally applying new source first. */
	getModule(filename: string, source?: string): BoundModule {
		if (source !== undefined) return this.updateModule(filename, source);
		this.assertActive();
		const canonical = normalizeFile(filename);
		this.setActiveNativeRoots([canonical]);
		assertNativeModulePresent(this.removedRoots.has(canonical), canonical);
		if (!this.snapshot || this.dirty) this.rebuild();
		return this.readBoundModule(canonical);
	}

	/** Binds an authored eXact expression module through the native checker. */
	async bind(module: UnboundModule): Promise<BoundModule> {
		return bindNativeModule(module, (filename, source) => this.updateModule(filename, source));
	}

	/** Emits a detached module with the transitional eXact printer. */
	emit(
		module: BoundModule,
		options: Parameters<BoundModule['emit']>[0] = {}
	): ReturnType<BoundModule['emit']> {
		return emitNativeModule(module, options);
	}

	/** Delegates assignability to the active TypeScript 7 checker generation. */
	isAssignable(source: ExpressionType, target: ExpressionType): boolean {
		return isNativeAssignable(source, target, this.typeHandles, this.compatibility);
	}

	/**
	 * Resolves module paths with the configured syntax resolver.
	 *
	 * TypeScript 7 does not yet expose module-resolution results through its
	 * unstable API, so this non-semantic utility remains in the compatibility
	 * package until that capability is available.
	 */
	resolveModuleSpecifier(specifier: string, containingFile: string): string | undefined {
		this.assertActive();
		return resolveNativeModuleSpecifier(
			specifier,
			containingFile,
			this.compilerOptions,
			this.overlays,
			this.moduleResolutionCache
		);
	}

	/** Removes one in-memory source from the next native snapshot. */
	removeModule(filename: string): void {
		this.removeModules([filename]);
	}

	/** Removes in-memory sources as one pending native transaction. */
	removeModules(filenames: Iterable<string>): void {
		this.assertActive();
		for (const filename of filenames) {
			const canonical = normalizeFile(filename);
			const wasOpen = this.openFiles.delete(canonical);
			this.pendingOpenFiles.delete(canonical);
			if (wasOpen) this.pendingCloseFiles.add(canonical);
			const hadOverlay = this.overlays.delete(canonical);
			const wasActiveRoot = this.activeNativeRoots.delete(canonical);
			this.overlayVersions.delete(canonical);
			this.boundModules.delete(canonical);
			const hadDiskRoot = this.diskRoots.delete(canonical);
			if (!this.configuredRoots.has(canonical)) this.removedRoots.add(canonical);
			this.diskVersions.delete(canonical);
			this.diskFileExistence.delete(canonical);
			this.diskFileContents.delete(canonical);
			this.nodeIdentityRoots.delete(canonical);
			const keys = this.identityKeysByFile.get(canonical);
			for (const key of keys ?? []) this.symbolIdentities.delete(key);
			this.identityKeysByFile.delete(canonical);
			if (hadOverlay)
				this.pendingChanges.set(canonical, fs.existsSync(canonical) ? 'changed' : 'deleted');
			else this.pendingChanges.delete(canonical);
			if (hadOverlay || hadDiskRoot || wasActiveRoot)
				this.pendingChanges.set(normalizeFile(this.nativeTsconfigPath), 'changed');
			if (wasOpen) this.dirty = true;
		}
		this.moduleResolutionCache.clear();
		this.dirty = true;
	}

	/** Marks one disk-backed file changed for the next snapshot. */
	invalidateFile(filename: string): void {
		this.invalidateFiles([filename]);
	}

	/** Marks disk-backed files changed as one pending native transaction. */
	invalidateFiles(filenames: Iterable<string>): void {
		this.assertActive();
		for (const filename of filenames) {
			const canonical = normalizeFile(filename);
			this.diskVersions.delete(canonical);
			this.diskFileExistence.delete(canonical);
			this.diskFileContents.delete(canonical);
			this.boundModules.delete(canonical);
			this.pendingChanges.set(canonical, fs.existsSync(canonical) ? 'changed' : 'deleted');
		}
		this.dirty = true;
	}

	/** Releases native snapshots, the server process, and all projections. */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.snapshot?.dispose();
		this.snapshot = undefined;
		this.native.close();
		this.overlays.clear();
		this.overlayVersions.clear();
		this.nativeFilenames.clear();
		this.boundModules.clear();
		this.diskRoots.clear();
		this.activeNativeRoots.clear();
		this.removedRoots.clear();
		this.openFiles.clear();
		this.pendingOpenFiles.clear();
		this.pendingChanges.clear();
		this.pendingCloseFiles.clear();
		this.nodeIdentityRoots.clear();
		this.symbolIdentities.clear();
		this.identityKeysByFile.clear();
		this.typeHandles = new WeakMap();
		this.compatibility = undefined;
		this.dirty = false;
	}

	/** Reports retained state and native transport counters. */
	stats(): ExpressionProjectStats {
		const timing = this.native.getTimingInfo();
		return Object.freeze({
			rebuilds: this.rebuildCount,
			semanticDiagnostics: this.semanticDiagnosticCount,
			overlays: this.overlays.size,
			sourceFiles: timing.totals.sourceFilesFetched,
			nodeIdentityRoots: this.nodeIdentityRoots.size,
			symbolIdentities: this.symbolIdentities.size,
			semanticBackend: this.semanticBackend,
			nativeSnapshots: this.snapshotCount,
			nativeRequests: timing.totals.requestCount,
			nativeBytesSent: timing.totals.bytesSent,
			nativeBytesReceived: timing.totals.bytesReceived,
			nativeNodesMaterialized: timing.totals.nodesMaterialized
		});
	}

	private rebuild(): void {
		if (!this.dirty && this.snapshot) return;
		const started = this.onProfile ? performance.now() : undefined;
		const changes = [...this.pendingChanges];
		try {
			const advanced = advanceNativeSnapshot({
				native: this.native,
				nativeTsconfigPath: this.nativeTsconfigPath,
				previous: this.snapshot,
				changes,
				overlays: this.overlays,
				openFiles: this.openFiles,
				pendingOpenFiles: this.pendingOpenFiles,
				pendingCloseFiles: this.pendingCloseFiles,
				nativeFilename: (filename) => this.nativeFilename(filename)
			});
			this.snapshot = advanced.snapshot;
			this.snapshotCount += advanced.snapshotsCreated;
		} catch (error) {
			throw nativeProjectFailure('EXPR_NATIVE_SNAPSHOT', 'advance snapshot', error);
		}
		this.rebuildCount++;
		this.pendingChanges.clear();
		this.pendingOpenFiles.clear();
		this.pendingCloseFiles.clear();
		this.boundModules.clear();
		this.typeHandles = new WeakMap();
		this.compatibility = undefined;
		this.dirty = false;
		if (started !== undefined) {
			const timing = this.native.getTimingInfo().totals;
			this.onProfile?.({
				subsystem: 'expressions',
				phase: 'native-snapshot',
				elapsedMs: performance.now() - started,
				fileCount: this.configuredRoots.size + this.openFiles.size,
				requestCount: timing.requestCount,
				bytesSent: timing.bytesSent,
				bytesReceived: timing.bytesReceived,
				nodesMaterialized: timing.nodesMaterialized
			});
		}
	}

	private readBoundModule(filename: string): BoundModule {
		const snapshot = this.snapshot!;
		const cached = this.boundModules.get(filename);
		if (cached?.snapshotId === snapshot.id) return cached.module;
		const projected = projectNativeExpressionModule({
			snapshot,
			filename,
			expectedSource: this.overlays.get(filename),
			nativeTsconfigPath: this.nativeTsconfigPath,
			diagnosticMode: this.diagnosticMode,
			profileDetail: this.profileDetail,
			profileEnabled: this.onProfile !== undefined,
			recordProfile: (event) => this.onProfile?.(Object.freeze(event)),
			recordSemanticDiagnostics: () => {
				this.semanticDiagnosticCount++;
			},
			nodeIdentityRoots: this.nodeIdentityRoots,
			overlayVersions: this.overlayVersions,
			typeHandles: this.typeHandles,
			symbolIdentities: this.symbolIdentities,
			identityKeysByFile: this.identityKeysByFile,
			fileVersion: (candidate) =>
				nativeFileVersion(candidate, this.overlayVersions, this.diskVersions)
		});
		this.compatibility = projected.compatibility;
		this.boundModules.set(filename, {
			snapshotId: snapshot.id,
			module: projected.module
		});
		return projected.module;
	}

	private setOverlay(filename: string, source: string): boolean {
		const changed = applyNativeOverlay({
			filename,
			source,
			overlays: this.overlays,
			overlayVersions: this.overlayVersions,
			removedRoots: this.removedRoots,
			openFiles: this.openFiles,
			pendingOpenFiles: this.pendingOpenFiles,
			pendingChanges: this.pendingChanges,
			nativeTsconfigPath: this.nativeTsconfigPath,
			boundModules: this.boundModules
		});
		if (!changed) return false;
		this.dirty = true;
		return true;
	}

	private nativeFilename(filename: string): string {
		return this.nativeFilenames.get(filename) ?? displayFile(filename);
	}

	private setActiveNativeRoots(filenames: Iterable<string>): boolean {
		const changed = setNativeConfigRoots(
			this.activeNativeRoots,
			filenames,
			this.pendingChanges,
			this.nativeTsconfigPath
		);
		if (changed) this.dirty = true;
		return changed;
	}

	private nativeConfigSource(): string {
		return nativeConfigSource(
			this.tsconfigPath,
			this.activeNativeRoots,
			this.diskRoots,
			(filename) => this.nativeFilename(filename)
		);
	}

	private assertActive(): void {
		assertNativeProjectActive(this.disposed);
	}
}
