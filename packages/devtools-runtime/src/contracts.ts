import type {
	ExactInspectionQueryService,
	ExactInspectionRequest,
	ExactInspectionResponse,
	ExactInspectionRuntimeId,
	ExactInspectionSessionDescription,
	ExactInspectionSubscription,
	ExactInspectionSubscriptionHandle
} from '@exactjs/devtools-protocol';
import type { ExactRuntimeInspectionOwner } from '@exactjs/core';

/** Versioned page-world hook consumed by Chromium UI and the CDP adapter. */
export interface ExactDevtoolsPageHook extends ExactInspectionQueryService {
	readonly protocol: 1;
	readonly connected: boolean;
	/** Shares a pending opening result. Connected calls return independent session descriptions. Rejects with AbortError if retired while opening. */
	connect(): Promise<ExactInspectionSessionDescription>;
	/** Detaches local resources immediately, fences pending opens, and closes the remote session. A later connect may start a fresh session. */
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
	/**
	 * Existing eXact server endpoint used for authorized debug cooperation. When omitted, the
	 * runtime discovers only compiler-owned hydration metadata and otherwise remains client-only.
	 */
	endpoint?: string;
	fetch?: typeof fetch;
	buildKey?: string;
	executionRoot?: string;
	binding?: string;
	maxEvents?: number;
	maxEventBytes?: number;
	highlightDurationMs?: number;
}>;

/** Disposable ownership returned by `installExactDevtoolsRuntime()`. */
export interface ExactDevtoolsRuntimeInstallation {
	readonly hook: ExactDevtoolsPageHook;
	readonly inspection: ExactRuntimeInspectionOwner;
	/** Permanently closes this installation. Repeated disposal shares the same cleanup and later connection attempts reject. */
	dispose(): Promise<void>;
}
