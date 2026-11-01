import type { ExactLanguageServiceUpdate } from '@exactjs/compiler';
import type { ExactHostedLanguageDiagnostic } from '@exactjs/language-extension-host';
import type { ExactDocumentSynchronization } from '../workspace-manager.js';
import { relevantLanguageProviderPackages } from '../provider-relevance.js';
import { providerFailureMessage } from './provider-request.js';
import type { WorkspaceState } from './state.js';

/** Completes one admitted core input while preserving the existing five await ownership fences. */
export async function finalizeWorkspaceSynchronization(
	workspace: WorkspaceState,
	filename: string,
	version: number,
	update: ExactLanguageServiceUpdate,
	isCurrent: () => boolean,
	signal?: AbortSignal
): Promise<ExactDocumentSynchronization | undefined> {
	try {
		if (!isCurrent()) return undefined;
		const inspection = await workspace.service.inspect(filename, undefined, signal);
		if (!isCurrent()) return undefined;
		const projection = Object.freeze({
			...inspection.languageProjection,
			document: Object.freeze({ ...inspection.languageProjection.document, version })
		});
		let providerDiagnostics: readonly ExactHostedLanguageDiagnostic[] = [];
		try {
			const host = await workspace.languageHost;
			if (!isCurrent()) return undefined;
			await host.synchronizeProviders(
				relevantLanguageProviderPackages(projection, workspace.packageEnhancements),
				signal
			);
			if (!isCurrent()) return undefined;
			const contribution = await host.diagnostics(projection, signal);
			if (!isCurrent()) return undefined;
			providerDiagnostics = contribution.diagnostics;
			workspace.providerFailure = undefined;
		} catch (error) {
			if (signal?.aborted) throw error;
			if (!isCurrent()) return undefined;
			workspace.providerFailure = providerFailureMessage(error);
		}
		return Object.freeze({
			update,
			inspection: Object.freeze({ ...inspection, languageProjection: projection }),
			providerDiagnostics
		});
	} catch (error) {
		if (signal?.aborted || isCurrent()) throw error;
		return undefined;
	}
}

/** Shares native inspection/error policy while retaining the manager's exact project/input authority. */
export async function inspectWorkspaceDocument(
	workspace: WorkspaceState,
	filename: string,
	isCurrent: () => boolean,
	signal?: AbortSignal
) {
	try {
		const inspection = await workspace.service.inspect(filename, undefined, signal);
		return isCurrent() ? inspection : undefined;
	} catch (error) {
		if (signal?.aborted || isCurrent()) throw error;
		return undefined;
	}
}
