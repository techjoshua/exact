import type { ExpressionType } from '../model.js';
import type { BoundModule, UnboundModule } from '../module.js';
import type { ExpressionProjectStats, SemanticBackend } from './contracts.js';

/**
 * Internal ownership boundary for one semantic compiler implementation.
 *
 * Backend-specific compiler objects must not appear in this contract.
 */
export interface ExpressionProjectBackend {
	readonly tsconfigPath: string;
	readonly semanticBackend: SemanticBackend;
	updateModule(filename: string, source: string): BoundModule;
	updateModules(
		entries: Iterable<readonly [filename: string, source: string]>
	): ReadonlyMap<string, BoundModule>;
	loadModule(filename: string): BoundModule;
	loadModules(filenames: Iterable<string>): ReadonlyMap<string, BoundModule>;
	getModule(filename: string, source?: string): BoundModule;
	bind(module: UnboundModule): Promise<BoundModule>;
	emit(
		module: BoundModule,
		options?: Parameters<BoundModule['emit']>[0]
	): ReturnType<BoundModule['emit']>;
	isAssignable(source: ExpressionType, target: ExpressionType): boolean;
	resolveModuleSpecifier(specifier: string, containingFile: string): string | undefined;
	removeModule(filename: string): void;
	removeModules(filenames: Iterable<string>): void;
	invalidateFile(filename: string): void;
	invalidateFiles(filenames: Iterable<string>): void;
	dispose(): void;
	stats(): ExpressionProjectStats;
}
