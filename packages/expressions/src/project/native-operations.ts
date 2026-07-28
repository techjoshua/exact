import path from 'node:path';
import fs from 'node:fs';
import ts from 'typescript';
import type { ExpressionType } from '../model.js';
import type { BoundModule, UnboundModule } from '../module.js';
import { createModule } from '../module.js';
import { ExpressionProjectError } from './errors.js';
import { diskFileVersion } from './filesystem.js';
import type { NativeProjectionCompatibility } from './native-compatibility.js';
import type { NativeChangeKind } from './native-snapshots.js';
import { displayFile, normalizeFile } from './syntax.js';

/** Binds an authored module through a caller-owned native update transaction. */
export async function bindNativeModule(
	module: UnboundModule,
	update: (filename: string, source: string) => BoundModule
): Promise<BoundModule> {
	const structuralErrors = module
		.validate()
		.filter((diagnostic) => diagnostic.severity === 'error');
	if (structuralErrors.length) throw new ExpressionProjectError(structuralErrors);
	const bound = update(module.filename, module.emit({ format: 'generated' }).code);
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

/** Emits a bound module after enforcing projected diagnostics. */
export function emitNativeModule(
	module: BoundModule,
	options: Parameters<BoundModule['emit']>[0]
): ReturnType<BoundModule['emit']> {
	const errors = module.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
	if (errors.length) throw new ExpressionProjectError(errors);
	return module.emit(options);
}

/** Resolves syntax imports without introducing a second semantic checker. */
export function resolveNativeModuleSpecifier(
	specifier: string,
	containingFile: string,
	compilerOptions: ts.CompilerOptions,
	overlays: ReadonlyMap<string, string>,
	cache: ts.ModuleResolutionCache
): string | undefined {
	const resolved = ts.resolveModuleName(
		specifier,
		containingFile,
		compilerOptions,
		{
			...ts.sys,
			fileExists: (file) => overlays.has(normalizeFile(file)) || ts.sys.fileExists(file),
			readFile: (file) => overlays.get(normalizeFile(file)) ?? ts.sys.readFile(file)
		},
		cache
	).resolvedModule;
	return resolved ? displayFile(resolved.resolvedFileName) : undefined;
}

/** Replaces the active virtual-config roots and reports whether they changed. */
export function setNativeConfigRoots(
	activeRoots: Set<string>,
	filenames: Iterable<string>,
	pendingChanges: Map<string, NativeChangeKind>,
	nativeTsconfigPath: string
): boolean {
	const next = new Set(filenames);
	if (next.size === activeRoots.size && [...next].every((filename) => activeRoots.has(filename)))
		return false;
	activeRoots.clear();
	for (const filename of next) activeRoots.add(filename);
	pendingChanges.set(normalizeFile(nativeTsconfigPath), 'changed');
	return true;
}

/** Serializes the eXact-owned virtual project configuration. */
export function nativeConfigSource(
	tsconfigPath: string,
	activeRoots: ReadonlySet<string>,
	diskRoots: ReadonlySet<string>,
	nativeFilename: (filename: string) => string
): string {
	const files = [...new Set([...activeRoots, ...diskRoots])].map(nativeFilename);
	return JSON.stringify({
		extends: displayFile(path.resolve(tsconfigPath)),
		files,
		include: []
	});
}

/** Applies one overlay mutation and schedules its native transaction. */
export function applyNativeOverlay(options: {
	filename: string;
	source: string;
	overlays: Map<string, string>;
	overlayVersions: Map<string, number>;
	removedRoots: Set<string>;
	openFiles: Set<string>;
	pendingOpenFiles: Set<string>;
	pendingChanges: Map<string, NativeChangeKind>;
	nativeTsconfigPath: string;
	boundModules: Map<string, unknown>;
}): boolean {
	if (options.overlays.get(options.filename) === options.source) return false;
	const hadOverlay = options.overlays.has(options.filename);
	const existed = hadOverlay || fs.existsSync(options.filename);
	options.overlayVersions.set(
		options.filename,
		(options.overlayVersions.get(options.filename) ?? 0) + 1
	);
	options.overlays.set(options.filename, options.source);
	options.removedRoots.delete(options.filename);
	if (!options.openFiles.has(options.filename)) options.pendingOpenFiles.add(options.filename);
	options.openFiles.add(options.filename);
	options.pendingChanges.set(options.filename, existed ? 'changed' : 'created');
	if (!hadOverlay) options.pendingChanges.set(normalizeFile(options.nativeTsconfigPath), 'changed');
	options.boundModules.delete(options.filename);
	return true;
}

/** Delegates assignability to native handles with a detached-value fallback. */
export function isNativeAssignable(
	source: ExpressionType,
	target: ExpressionType,
	typeHandles: WeakMap<ExpressionType, ts.Type>,
	compatibility?: NativeProjectionCompatibility
): boolean {
	const sourceHandle = typeHandles.get(source);
	const targetHandle = typeHandles.get(target);
	if (sourceHandle && targetHandle && compatibility)
		return compatibility.checker.isTypeAssignableTo(sourceHandle, targetHandle);
	if (
		source.id === target.id ||
		target.kind === 'any' ||
		target.kind === 'unknown' ||
		source.kind === 'never'
	)
		return true;
	if (target.kind === 'union')
		return target.unionMembers.some((member) =>
			isNativeAssignable(source, member, typeHandles, compatibility)
		);
	if (source.kind === 'union')
		return source.unionMembers.every((member) =>
			isNativeAssignable(member, target, typeHandles, compatibility)
		);
	return source.display === target.display;
}

/** Rejects work after a native project has released its process. */
export function assertNativeProjectActive(disposed: boolean): void {
	if (!disposed) return;
	throw new ExpressionProjectError([
		{
			code: 'EXPR_PROJECT_DISPOSED',
			message: 'This expression project has been disposed',
			severity: 'error',
			phase: 'configuration'
		}
	]);
}

/** Rejects access to a module removed from the current native workspace. */
export function assertNativeModulePresent(removed: boolean, filename: string): void {
	if (!removed) return;
	throw new ExpressionProjectError([
		{
			code: 'EXPR_FILE_MISSING',
			message: `Module is not part of the native expression project: ${filename}`,
			severity: 'error',
			filename
		}
	]);
}

/** Normalizes a native process failure into the expression diagnostic model. */
export function nativeProjectFailure(
	code: string,
	operation: string,
	error: unknown
): ExpressionProjectError {
	const detail = error instanceof Error ? error.message : String(error);
	return new ExpressionProjectError([
		{
			code,
			message: `TypeScript 7 native backend could not ${operation}: ${detail}`,
			severity: 'error',
			phase: 'configuration'
		}
	]);
}

/** Returns and caches the current disk or overlay version token. */
export function nativeFileVersion(
	filename: string,
	overlayVersions: ReadonlyMap<string, number>,
	diskVersions: Map<string, string>
): string {
	const overlay = overlayVersions.get(filename);
	if (overlay !== undefined) return overlay.toString();
	const cached = diskVersions.get(filename);
	if (cached) return cached;
	const version = diskFileVersion(filename);
	diskVersions.set(filename, version);
	return version;
}
