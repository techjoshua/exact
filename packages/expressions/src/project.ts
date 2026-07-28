import path from 'node:path';
import ts from 'typescript';
import type { ExpressionType } from './model.js';
import type { BoundModule, UnboundModule } from './module.js';
import type { ExpressionProjectBackend } from './project/backend.js';
import type {
	ExpressionProjectOptions,
	ExpressionProjectStats,
	SemanticBackend
} from './project/contracts.js';
import { LegacyExpressionProject } from './project/legacy-project.js';
import { NativeExpressionProject } from './project/native-project.js';

export type {
	ExpressionProjectOptions,
	ExpressionProjectProfileEvent,
	ExpressionProjectStats,
	SemanticBackend
} from './project/contracts.js';
export { ExpressionProjectError } from './project/errors.js';

/**
 * Project-aware semantic compiler facade.
 *
 * Native and compatibility compiler objects remain owned by the selected
 * backend and never escape through this API.
 */
export class ExpressionProject implements ExpressionProjectBackend {
	private readonly backend: ExpressionProjectBackend;

	constructor(options: ExpressionProjectOptions = {}) {
		this.backend =
			(options.semanticBackend ?? 'native') === 'native'
				? new NativeExpressionProject(options)
				: new LegacyExpressionProject(options);
	}

	/** Canonical configuration file that defines this project workspace. */
	get tsconfigPath(): string {
		return this.backend.tsconfigPath;
	}

	/** Semantic compiler implementation owned by this project. */
	get semanticBackend(): SemanticBackend {
		return this.backend.semanticBackend;
	}

	/** Applies one in-memory source revision and returns its immutable projection. */
	updateModule(filename: string, source: string): BoundModule {
		return this.backend.updateModule(filename, source);
	}

	/** Applies one atomic in-memory source transaction. */
	updateModules(
		entries: Iterable<readonly [filename: string, source: string]>
	): ReadonlyMap<string, BoundModule> {
		return this.backend.updateModules(entries);
	}

	/** Loads and projects one disk-backed module. */
	loadModule(filename: string): BoundModule {
		return this.backend.loadModule(filename);
	}

	/** Loads and projects a disk-backed module transaction. */
	loadModules(filenames: Iterable<string>): ReadonlyMap<string, BoundModule> {
		return this.backend.loadModules(filenames);
	}

	/** Returns the current module projection, optionally applying a new source first. */
	getModule(filename: string, source?: string): BoundModule {
		return this.backend.getModule(filename, source);
	}

	/** Binds an authored expression module through the selected semantic compiler. */
	bind(module: UnboundModule): Promise<BoundModule> {
		return this.backend.bind(module);
	}

	/** Emits a validated bound module without exposing backend compiler objects. */
	emit(
		module: BoundModule,
		options: Parameters<BoundModule['emit']>[0] = {}
	): ReturnType<BoundModule['emit']> {
		return this.backend.emit(module, options);
	}

	/** Tests assignability using type handles from the current backend generation. */
	isAssignable(source: ExpressionType, target: ExpressionType): boolean {
		return this.backend.isAssignable(source, target);
	}

	/** Resolves a module specifier under this project's compiler configuration. */
	resolveModuleSpecifier(specifier: string, containingFile: string): string | undefined {
		return this.backend.resolveModuleSpecifier(specifier, containingFile);
	}

	/** Removes one in-memory module from the next project generation. */
	removeModule(filename: string): void {
		this.backend.removeModule(filename);
	}

	/** Removes an in-memory module transaction from the next project generation. */
	removeModules(filenames: Iterable<string>): void {
		this.backend.removeModules(filenames);
	}

	/** Marks one disk-backed module changed for the next project generation. */
	invalidateFile(filename: string): void {
		this.backend.invalidateFile(filename);
	}

	/** Marks a disk-backed module transaction changed for the next generation. */
	invalidateFiles(filenames: Iterable<string>): void {
		this.backend.invalidateFiles(filenames);
	}

	/** Releases compiler processes, snapshots, projections, and filesystem state. */
	dispose(): void {
		this.backend.dispose();
	}

	/** Reports retained projection state and backend transport counters. */
	stats(): ExpressionProjectStats {
		return this.backend.stats();
	}
}

/** Creates an expression project using the selected semantic backend. */
export function createExpressionProject(options: ExpressionProjectOptions = {}): ExpressionProject {
	return new ExpressionProject(options);
}

/** Finds the nearest usable project configuration without exposing TypeScript. */
export function findExpressionConfig(cwd: string): string | undefined {
	return ts.findConfigFile(path.resolve(cwd), ts.sys.fileExists, 'tsconfig.json');
}
