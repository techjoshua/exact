import type {
	ExactRefactorKind,
	ExactRefactorPlan,
	ExactSourceEntity,
	ExactSourceInspection,
	ExactSourceRange
} from '@exactjs/compiler';
import type { ExactLanguageProviderStatus } from '@exactjs/language-extension-host';

/** Initialization options understood by the eXact language server. */
export type ExactLanguageServerInitializationOptions = Readonly<{
	workspaceTrusted?: boolean;
	trace?: 'off' | 'messages' | 'verbose';
	inlayHints?: 'off' | 'important' | 'all';
}>;

/** Parameters for the structured component-semantics request. */
export type ExactComponentSemanticsParams = Readonly<{
	textDocument: Readonly<{ uri: string }>;
}>;

/** Parameters for source decorations that expose provider inference evidence. */
export type ExactInferenceDecorationsParams = ExactComponentSemanticsParams;

/** Versioned provider evidence rendered as unobtrusive source decorations. */
export type ExactInferenceDecorationsResult = Readonly<{
	version: number;
	decorations: readonly Readonly<{
		range: ExactSourceRange;
		kind: string;
		hover: string;
		provider: string;
	}>[];
}>;

/** Parameters for resolving the explanation behind one compiler entity. */
export type ExactExplainEntityParams = ExactComponentSemanticsParams &
	Readonly<{ entityId: string }>;

/** Parameters for a version-bound semantic refactor preview. */
export type ExactPreviewSemanticChangeParams = ExactComponentSemanticsParams &
	Readonly<{
		version: number;
		range: ExactSourceRange;
		kind: ExactRefactorKind;
	}>;

/** Structured response returned by `exact/componentSemantics`. */
export type ExactComponentSemanticsResult = ExactSourceInspection;

/** Structured response returned by `exact/explainEntity`. */
export type ExactExplainEntityResult = ExactSourceEntity | undefined;

/** Structured response returned by `exact/previewSemanticChange`. */
export type ExactPreviewSemanticChangeResult = ExactRefactorPlan | undefined;

/** Read-only conceptual compiler-separation document. */
export type ExactCompilerSeparationResult = Readonly<{
	generation: number;
	uri: string;
	content: string;
}>;

/** Active compiler and project ownership shown by editor clients. */
export type ExactProjectStatusResult = Readonly<{
	trusted: boolean;
	project?: ExactSourceInspection['project'];
	compiler?: ExactSourceInspection['compiler'];
	providers?: readonly ExactLanguageProviderStatus[];
	providerFailure?: string;
}>;
