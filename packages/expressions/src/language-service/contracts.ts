import type ts from 'typescript';
import type { ExpressionDiagnostic } from '../model.js';

/** Configures expression language service. */
export type ExpressionLanguageServiceOptions = Readonly<{
	tsconfigPath?: string;
	cwd?: string;
	forceModuleDetection?: boolean;
}>;

/** Defines the expression language service change type contract. */
export type ExpressionLanguageServiceChange = Readonly<{
	filename: string;
	kind: 'upsert' | 'delete';
	source?: string;
}>;

/** Defines the expression language service update type contract. */
export type ExpressionLanguageServiceUpdate = Readonly<{
	generation: number;
	changedFiles: readonly string[];
	affectedFiles: readonly string[];
	diagnostics: readonly ExpressionDiagnostic[];
}>;

/** Defines the expression language service stats type contract. */
export type ExpressionLanguageServiceStats = Readonly<{
	generations: number;
	snapshots: number;
	scripts: number;
	affectedFiles: number;
	diagnosticPasses: number;
	synchronizationMs: number;
}>;

/** Defines the snapshot entry type contract. */
export type SnapshotEntry = Readonly<{ version: string; snapshot: ts.IScriptSnapshot }>;
