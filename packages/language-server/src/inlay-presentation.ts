import type { ExactLanguageInlayHintV1 } from '@exactjs/language-extension-api';
import type { Connection, InlayHint, TextDocuments } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type {
	ExactInferenceDecorationsParams,
	ExactInferenceDecorationsResult
} from './contracts.js';
import { captureDocumentSnapshot, isCurrentDocumentSnapshot } from './document-snapshots.js';
import { projectInlayHints, sourceOffset } from './lsp-projections.js';
import type { ExactLanguageWorkspaceManager } from './workspace-manager.js';

type HostedInlay = Readonly<{ provider: string; value: ExactLanguageInlayHintV1 }>;

/** Controls standard inlays and provider-authored inference evidence for one LSP connection. */
export interface ExactInlayPresentationController {
	setLevel(level: unknown): void;
}

/** Registers the standard and eXact-specific inlay presentation requests. */
export function registerInlayPresentation(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	workspace: () => ExactLanguageWorkspaceManager | undefined,
	analysisActive: (uri: string) => boolean
): ExactInlayPresentationController {
	let level: 'off' | 'important' | 'all' = 'important';
	const setLevel = (candidate: unknown): boolean => {
		if (candidate !== 'off' && candidate !== 'important' && candidate !== 'all') return false;
		if (candidate === level) return false;
		level = candidate;
		return true;
	};
	connection.onNotification(
		'exact/inlayHintLevelChanged',
		({ level: candidate }: { level?: unknown }) => {
			if (setLevel(candidate)) void connection.languages.inlayHint.refresh().catch(() => undefined);
		}
	);
	connection.languages.inlayHint.on(async (params): Promise<InlayHint[]> => {
		if (level === 'off') return [];
		if (analysisActive(params.textDocument.uri)) return [];
		const document = documents.get(params.textDocument.uri);
		if (!document) return [];
		const snapshot = captureDocumentSnapshot(document);
		const inspection = await workspace()?.inspect(snapshot.uri);
		if (!inspection || !isCurrentDocumentSnapshot(snapshot, documents.get(snapshot.uri))) return [];
		const core = projectInlayHints(inspection, snapshot.source);
		const contributions = await workspace()?.inlayHints(snapshot.uri, {
			start: sourceOffset(snapshot.source, params.range.start),
			end: sourceOffset(snapshot.source, params.range.end)
		});
		return [...core, ...projectProviderInlays(document, contributions ?? [])];
	});
	connection.onRequest(
		'exact/inferenceDecorations',
		async (
			params: ExactInferenceDecorationsParams
		): Promise<ExactInferenceDecorationsResult | undefined> => {
			if (level === 'off') return undefined;
			if (analysisActive(params.textDocument.uri)) return undefined;
			const document = documents.get(params.textDocument.uri);
			if (!document) return undefined;
			const snapshot = captureDocumentSnapshot(document);
			const contributions = await workspace()?.inlayHints(snapshot.uri, {
				start: 0,
				end: snapshot.source.length
			});
			if (!isCurrentDocumentSnapshot(snapshot, documents.get(snapshot.uri))) return undefined;
			return {
				version: snapshot.version,
				decorations: projectInferenceEvidence(contributions ?? [])
			};
		}
	);
	return Object.freeze({ setLevel: (candidate: unknown) => void setLevel(candidate) });
}

function projectProviderInlays(
	document: TextDocument,
	contributions: readonly HostedInlay[]
): InlayHint[] {
	return contributions.map(({ provider, value }) => ({
		position: document.positionAt(value.position),
		label: value.label,
		tooltip: value.tooltip ? `${value.tooltip}\n\nSource: ${provider}` : `Source: ${provider}`,
		paddingLeft: value.paddingLeft,
		paddingRight: value.paddingRight
	}));
}

/** Deduplicates hosted evidence while retaining provider provenance for editor hover. */
export function projectInferenceEvidence(
	contributions: readonly HostedInlay[]
): ExactInferenceDecorationsResult['decorations'] {
	const seen = new Set<string>();
	return contributions.flatMap(({ provider, value }) =>
		(value.evidence ?? []).flatMap((evidence) => {
			const key = `${provider}:${evidence.range.start}:${evidence.range.end}:${evidence.kind}`;
			if (seen.has(key)) return [];
			seen.add(key);
			return [
				{
					range: evidence.range,
					kind: evidence.kind,
					hover: `Inferred ${evidence.kind.replaceAll('-', ' ')}\n\n${evidence.explanation}\n\nSource: ${provider}`,
					provider
				}
			];
		})
	);
}
