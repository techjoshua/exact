import type {
	ExactInspectionRequest,
	ExactInspectionResponse,
	ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';

/** Request sent from the panel to the inspected page bridge. */
export type ExactExtensionRequest = Readonly<
	| { id: string; type: 'connect' }
	| { id: string; type: 'disconnect' }
	| { id: string; type: 'query'; request: ExactInspectionRequest }
	| { id: string; type: 'subscribe'; sessionId: string; cursor?: string }
	| { id: string; type: 'unsubscribe'; subscriptionId: string }
	| { id: string; type: 'highlight'; identity: unknown }
>;

/** Response or live event returned through the extension-owned bridge. */
export type ExactExtensionResponse = Readonly<
	| { id: string; ok: true; result?: unknown }
	| { id: string; ok: false; error: string }
	| { type: 'event'; subscriptionId: string; event: ExactRuntimeInspectionEvent }
>;

/** Port abstraction used by panel models and tests. */
export interface ExactExtensionQueryClient {
	connect(): Promise<{ id: string }>;
	request(request: ExactInspectionRequest): Promise<ExactInspectionResponse>;
	subscribe(
		sessionId: string,
		cursor: string | undefined,
		listener: (event: ExactRuntimeInspectionEvent) => void
	): Promise<Readonly<{ close(): Promise<void> }>>;
	disconnect(): Promise<void>;
	highlight(identity: unknown): Promise<void>;
}
