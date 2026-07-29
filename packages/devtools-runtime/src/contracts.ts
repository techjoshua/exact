import type {
	ExactInspectionQueryService,
	ExactInspectionRequest,
	ExactInspectionResponse,
	ExactInspectionRuntimeId,
	ExactInspectionSessionDescription,
	ExactInspectionSubscription,
	ExactInspectionSubscriptionHandle,
	ExactInspectionRedactionCatalog
} from '@exactjs/devtools-protocol';
import type { ExactRuntimeInspectionOwner } from '@exactjs/core';

/** Compact compiler registration present only in instrumented client output. */
export type ExactClientSourceCorrelation = Readonly<{
	protocol: 1;
	/** Value-free selectors derived by the compiler for client-side preview redaction. */
	redactions?: ExactInspectionRedactionCatalog;
	components: readonly Readonly<{
		componentTypeId: string;
		slots: readonly Readonly<{ id: string; kind: string }>[];
	}>[];
}>;

/** Runtime queue populated by compiler-emitted source registrations. */
export interface ExactClientCorrelationRuntime {
	readonly sources: ExactClientSourceCorrelation[];
	registerSource(source: ExactClientSourceCorrelation): void;
}

/** Versioned page-world hook consumed by Chromium UI and the CDP adapter. */
export interface ExactDevtoolsPageHook extends ExactInspectionQueryService {
	readonly protocol: 1;
	readonly connected: boolean;
	connect(): Promise<ExactInspectionSessionDescription>;
	disconnect(): Promise<void>;
	ownerOfElement(element: Element): ExactInspectionRuntimeId | undefined;
	highlight(identity: ExactInspectionRuntimeId): void;
	clearHighlight(): void;
	request(request: ExactInspectionRequest): Promise<ExactInspectionResponse>;
	subscribe(
		request: ExactInspectionSubscription,
		listener: Parameters<ExactInspectionQueryService['subscribe']>[1]
	): ExactInspectionSubscriptionHandle;
}

/** Options for one explicit page-world runtime installation. */
export type ExactDevtoolsRuntimeOptions = Readonly<{
	endpoint?: string;
	fetch?: typeof fetch;
	buildKey?: string;
	executionRoot?: string;
	binding?: string;
	redactions?: Partial<ExactInspectionRedactionCatalog>;
	maxEvents?: number;
	maxEventBytes?: number;
	highlightDurationMs?: number;
}>;

/** Disposable ownership returned by `installExactDevtoolsRuntime()`. */
export interface ExactDevtoolsRuntimeInstallation {
	readonly hook: ExactDevtoolsPageHook;
	readonly inspection: ExactRuntimeInspectionOwner;
	dispose(): Promise<void>;
}
