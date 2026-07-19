import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import type { ExpressionDiagnostic } from './model.js';
import type {
	ExpressionLanguageServiceChange,
	ExpressionLanguageServiceOptions,
	ExpressionLanguageServiceStats,
	ExpressionLanguageServiceUpdate
} from './language-service/contracts.js';
export type {
	ExpressionLanguageServiceChange,
	ExpressionLanguageServiceOptions,
	ExpressionLanguageServiceStats,
	ExpressionLanguageServiceUpdate
} from './language-service/contracts.js';
import { ExpressionLanguageServiceSession } from './language-service/session.js';
import {
	canonicalFile,
	displayFile,
	freezeUpdate,
	isConfigurationDependency,
	isScript,
	uniqueDiagnostics
} from './language-service/utilities.js';
import { ExpressionProjectError } from './project.js';

/** Long-lived TypeScript diagnostics and affected-file sidecar. */
export class ExpressionLanguageService extends ExpressionLanguageServiceSession {
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
			if (
				change.kind === 'upsert' &&
				change.source !== undefined &&
				previous?.source === change.source
			)
				continue;
			if (change.kind === 'delete' && this.deleted.has(normalized)) continue;
			changedFiles.push(filename);
			structural ||=
				change.kind === 'delete' ||
				!this.hasScript(normalized) ||
				isConfigurationDependency(filename);
			this.snapshots.delete(normalized);
			this.diskRevisions.set(normalized, (this.diskRevisions.get(normalized) ?? 0) + 1);
			if (change.kind === 'delete') {
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
		if (
			this.initialized &&
			!structural &&
			changedFiles.every((filename) => {
				const normalized = canonicalFile(filename);
				return (
					!this.reverseDependencies.get(normalized)?.size &&
					this.dependencySignatures.get(normalized) === this.dependencySignature(filename)
				);
			})
		) {
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
					diagnostics.push(
						...this.service
							.getSemanticDiagnostics(filename)
							.map((diagnostic) => this.normalizeDiagnostic(diagnostic, 'semantic'))
					);
				}
			}
			const affectedFiles = changedFiles.map((filename) => this.preferredFilename(filename)).sort();
			this.affectedFileCount += affectedFiles.length;
			this.synchronizationTime += performance.now() - started;
			return freezeUpdate(
				this.generation,
				changedFiles,
				affectedFiles,
				uniqueDiagnostics(diagnostics)
			);
		}
		const program = this.service.getProgram();
		if (!program)
			throw new ExpressionProjectError([
				{
					code: 'EXPR_LANGUAGE_SERVICE_PROGRAM',
					message: `TypeScript did not create a configured program for ${this.tsconfigPath}`,
					severity: 'error',
					phase: 'configuration'
				}
			]);
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
			if (result.filename)
				affected.set(canonicalFile(result.filename), this.preferredFilename(result.filename));
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
				if (previousSignature !== nextSignature)
					for (const consumer of consumers) {
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
			diagnostics.flatMap((diagnostic) =>
				diagnostic.filename ? [canonicalFile(diagnostic.filename)] : []
			)
		);
		for (const filename of affectedFiles) {
			if (
				this.deleted.has(canonicalFile(filename)) ||
				semanticFilesAlreadyReported.has(canonicalFile(filename))
			)
				continue;
			this.diagnosticPassCount++;
			diagnostics.push(
				...this.service
					.getSemanticDiagnostics(filename)
					.map((diagnostic) => this.normalizeDiagnostic(diagnostic, 'semantic'))
			);
		}
		this.refreshDependencyGraph(program);
		this.affectedFileCount += affectedFiles.length;
		this.synchronizationTime += performance.now() - started;
		return freezeUpdate(
			this.generation,
			changedFiles,
			affectedFiles,
			uniqueDiagnostics(diagnostics)
		);
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
}

export function createExpressionLanguageService(
	options: ExpressionLanguageServiceOptions = {}
): ExpressionLanguageService {
	return new ExpressionLanguageService(options);
}
