import type ts from 'typescript';
import type { ExpressionDiagnostic } from '../model.js';

export type ExpressionLanguageServiceOptions = Readonly<{
	tsconfigPath?: string;
	cwd?: string;
	forceModuleDetection?: boolean;
}>;

export type ExpressionLanguageServiceChange = Readonly<{
	filename: string;
	kind: 'upsert' | 'delete';
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

export type SnapshotEntry = Readonly<{ version: string; snapshot: ts.IScriptSnapshot }>;
