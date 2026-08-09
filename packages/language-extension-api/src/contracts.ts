/** JSON values permitted across the language-extension process boundary. */
export type ExactLanguageJsonValue =
	| null
	| boolean
	| number
	| string
	| readonly ExactLanguageJsonValue[]
	| { readonly [key: string]: ExactLanguageJsonValue };

/** Augmentation registry mapping canonical provider IDs to their JSON configuration. */
export interface ExactLanguageProviderConfigRegistry {}

/** Half-open UTF-16 source offsets. */
export type ExactLanguageRange = Readonly<{ start: number; end: number }>;

/** Executable roles an analyzer may declare. */
export type ExactLanguageAnalyzerCapability =
	| 'diagnostics'
	| 'completions'
	| 'hover'
	| 'inlayHints'
	| 'codeActions';

/** Compiler-owned facts an analyzer may request. */
export type ExactLanguageProjectionCapability =
	| 'sourceText'
	| 'imports'
	| 'components'
	| 'enhancements'
	| 'jsx'
	| 'expressions'
	| 'types'
	| 'projectGraph';

/** Inert package-manifest declaration for protocol 1. */
export interface ExactLanguageDeclarationV1 {
	readonly schemaVersion: 1;
	readonly declarative?: string;
	readonly analyzer?: Readonly<{
		protocolVersion: string;
		subpath: string;
		capabilities: readonly ExactLanguageAnalyzerCapability[];
		projection: readonly ExactLanguageProjectionCapability[];
		data?: readonly string[];
	}>;
}

/** Package provenance attached to resolved imports and analyzer identity. */
export type ExactLanguagePackageV1 = Readonly<{
	name: string;
	version?: string;
	integrity?: string;
	subpath?: string;
}>;

/** One resolved source import. */
export type ExactResolvedImportV1 = Readonly<{
	specifier: string;
	range: ExactLanguageRange;
	kind: 'runtime' | 'type';
	/** True only for an attributed import that opts this document into an enhancement provider. */
	enhancement?: true;
	resolvedFile?: string;
	package?: ExactLanguagePackageV1;
}>;

/** One compiler-finite component fact. */
export type ExactComponentLanguageFactV1 = Readonly<{
	id: string;
	name: string;
	range: ExactLanguageRange;
	nameRange: ExactLanguageRange;
	placement?: 'client' | 'server' | 'shared';
	artifactTargets: readonly string[];
	renderEdges: readonly string[];
}>;

/** One canonical enhancement activation joined to its authored JSX. */
export type ExactEnhancementActivationV1 = Readonly<{
	id: string;
	namespace: string;
	activator: string;
	range: ExactLanguageRange;
	nameRange: ExactLanguageRange;
	valueRange?: ExactLanguageRange;
	identity?: string;
	module?: string;
	exportName?: string;
	package?: ExactLanguagePackageV1;
	targetJsxId: string;
	ownerComponentId?: string;
	payloadExpressionId?: string;
	application: 'direct' | 'enhancement-target' | 'target-intrinsic' | 'propagated';
}>;

/** One JSX attribute visible to generic language analyzers. */
export type ExactJsxAttributeV1 = Readonly<{
	name: string;
	namespace?: string;
	localName: string;
	range: ExactLanguageRange;
	nameRange: ExactLanguageRange;
	valueRange?: ExactLanguageRange;
	valueKind: 'boolean' | 'string' | 'expression' | 'spread';
	constant?: ExactLanguageJsonValue;
	expressionId?: string;
}>;

/** One JSX element or framework target. */
export type ExactJsxLanguageFactV1 = Readonly<{
	id: string;
	range: ExactLanguageRange;
	openingRange: ExactLanguageRange;
	tagRange: ExactLanguageRange;
	kind: 'intrinsic' | 'component' | 'fragment' | 'enhancement-target';
	tag?: string;
	componentId?: string;
	ownerComponentId?: string;
	attributes: readonly ExactJsxAttributeV1[];
}>;

/** One compiler-observed expression. */
export type ExactExpressionLanguageFactV1 = Readonly<{
	id: string;
	range: ExactLanguageRange;
	syntaxKind: string;
	constant?: ExactLanguageJsonValue;
	referencedSymbols: readonly string[];
	reactiveDependencies: readonly string[];
	effect: 'pure' | 'reads-state' | 'writes-state' | 'unknown';
}>;

/** Normalized type information for an expression. */
export type ExactTypeLanguageFactV1 = Readonly<{
	expressionId: string;
	types: readonly (
		| 'string'
		| 'number'
		| 'bigint'
		| 'boolean'
		| 'null'
		| 'undefined'
		| 'array'
		| 'object'
		| 'function'
		| 'date'
		| 'temporal-duration'
		| 'unknown'
	)[];
	nominal?: Readonly<{ package: string; exportName: string }>;
}>;

/** Stable serialized compiler view supplied to protocol-1 analyzers. */
export interface ExactLanguageProjectionV1 {
	readonly protocol: 1;
	readonly generation: number;
	readonly project: Readonly<{
		root: string;
		kind: 'configured' | 'inferred';
		configFile?: string;
	}>;
	readonly document: Readonly<{
		uri: string;
		path: string;
		version: number;
		textHash: string;
		text?: string;
	}>;
	readonly imports: readonly ExactResolvedImportV1[];
	readonly components: readonly ExactComponentLanguageFactV1[];
	readonly enhancements: readonly ExactEnhancementActivationV1[];
	readonly jsx: readonly ExactJsxLanguageFactV1[];
	readonly expressions: readonly ExactExpressionLanguageFactV1[];
	readonly types: readonly ExactTypeLanguageFactV1[];
	readonly configuration?: ExactLanguageJsonValue;
}

/** Severity levels emitted by a language provider. */
export type ExactLanguageDiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint';

/** A source-located provider diagnostic. */
export interface ExactLanguageDiagnosticV1 {
	readonly code: string;
	readonly severity: ExactLanguageDiagnosticSeverity;
	readonly range: ExactLanguageRange;
	readonly summary: string;
	readonly explanation?: string;
	readonly related?: readonly Readonly<{
		uri?: string;
		range: ExactLanguageRange;
		message: string;
	}>[];
	readonly documentation?: string;
	readonly tags?: readonly ('deprecated' | 'unnecessary')[];
	readonly fingerprint?: string;
}

/** Completion returned by a provider. */
export interface ExactLanguageCompletionV1 {
	readonly label: string;
	readonly detail?: string;
	readonly documentation?: string;
	readonly insertText?: string;
	readonly replace?: ExactLanguageRange;
	readonly sortText?: string;
}

/** Restricted Markdown hover returned by a provider. */
export interface ExactLanguageHoverV1 {
	readonly range?: ExactLanguageRange;
	readonly markdown: string;
}

/** Non-editing inline information returned by a provider. */
export interface ExactLanguageInlayHintV1 {
	readonly position: number;
	readonly label: string;
	readonly tooltip?: string;
	readonly paddingLeft?: boolean;
	readonly paddingRight?: boolean;
	/** Source ranges whose authored syntax proves the summarized inference. */
	readonly evidence?: readonly ExactLanguageInferenceEvidenceV1[];
}

/** One source fragment that proves a provider's inferred behavior. */
export interface ExactLanguageInferenceEvidenceV1 {
	readonly range: ExactLanguageRange;
	readonly kind: string;
	readonly explanation: string;
}

/** One version-bound text edit proposed by a provider. */
export interface ExactLanguageTextEditV1 {
	readonly uri: string;
	readonly version: number;
	readonly range: ExactLanguageRange;
	readonly newText: string;
}

/** Safe data-only source action returned by a provider. */
export interface ExactLanguageCodeActionV1 {
	readonly title: string;
	readonly kind: 'quickfix' | 'refactor';
	readonly diagnostics?: readonly string[];
	readonly edits: readonly ExactLanguageTextEditV1[];
}

/** Shared request fields for one immutable document generation. */
export interface ExactLanguageDocumentRequestV1 {
	readonly projection: ExactLanguageProjectionV1;
}

/** Document or compiler-finite project validation request. */
export interface ExactLanguageDiagnosticsRequestV1 extends ExactLanguageDocumentRequestV1 {
	readonly scope: 'document' | 'project';
	readonly documents?: readonly ExactLanguageProjectionV1[];
}

/** Cursor completion request. */
export interface ExactLanguageCompletionRequestV1 extends ExactLanguageDocumentRequestV1 {
	readonly position: number;
	readonly trigger?: string;
}

/** Hover request. */
export interface ExactLanguageHoverRequestV1 extends ExactLanguageDocumentRequestV1 {
	readonly position: number;
}

/** Visible-range inlay-hint request. */
export interface ExactLanguageInlayHintRequestV1 extends ExactLanguageDocumentRequestV1 {
	readonly range: ExactLanguageRange;
}

/** Selected-range source-action request. */
export interface ExactLanguageCodeActionRequestV1 extends ExactLanguageDocumentRequestV1 {
	readonly range: ExactLanguageRange;
	readonly diagnostics: readonly string[];
}

/** Immutable analyzer initialization data chosen by the host. */
export interface ExactLanguageAnalyzerContext {
	readonly protocol: '1.0.0';
	readonly provider: ExactLanguagePackageV1;
	readonly packageRoot: string;
	readonly workspace: Readonly<{ root: string; locale?: string }>;
	readonly capabilities: readonly ExactLanguageAnalyzerCapability[];
	readonly configuration?: ExactLanguageJsonValue;
	readonly dataFiles: readonly string[];
}

/** Package-owned semantic analyzer. The runner owns transport and cancellation routing. */
export interface ExactLanguageAnalyzer {
	diagnostics(
		request: ExactLanguageDiagnosticsRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageDiagnosticV1[]>;
	complete?(
		request: ExactLanguageCompletionRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageCompletionV1[]>;
	hover?(
		request: ExactLanguageHoverRequestV1,
		signal: AbortSignal
	): Promise<ExactLanguageHoverV1 | undefined>;
	inlayHints?(
		request: ExactLanguageInlayHintRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageInlayHintV1[]>;
	codeActions?(
		request: ExactLanguageCodeActionRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageCodeActionV1[]>;
	invalidate?(generation: number): void | Promise<void>;
	dispose?(): void | Promise<void>;
}

/** Fixed module factory exported by executable language contributions. */
export type ExactLanguageAnalyzerFactory = (
	context: ExactLanguageAnalyzerContext
) => ExactLanguageAnalyzer | Promise<ExactLanguageAnalyzer>;
