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

/** Observable lifecycle state for the inspected-page transport. */
export type ExactExtensionBridgeStatus =
	| 'connecting'
	| 'waiting-for-page'
	| 'waiting-for-runtime'
	| 'ready'
	| 'reconnecting';

/** Control message exchanged by extension contexts without entering the inspection protocol. */
export type ExactExtensionControlMessage = Readonly<{
	channel: 'exact-devtools-control';
	type: 'status';
	status: ExactExtensionBridgeStatus;
	documentId?: string;
	bridgeId?: string;
}>;

/** Document-scoped greeting sent from the isolated content script to the main-world bridge. */
export type ExactPageBridgeHello = Readonly<{
	type: 'hello';
	documentId: string;
}>;

/** Main-world acknowledgement proving both bridge and runtime readiness. */
export type ExactPageBridgeReady = Readonly<{
	type: 'ready';
	documentId: string;
	bridgeId: string;
	runtimeReady: boolean;
	protocol?: number;
}>;

/** Generation-fenced notification that the isolated transport has been replaced. */
export type ExactPageBridgeDisconnect = Readonly<{
	type: 'transport-disconnect';
	documentId: string;
}>;

/** Port abstraction used by panel models and tests. */
export interface ExactExtensionQueryClient {
	onStatus(listener: (status: ExactExtensionBridgeStatus) => void): () => void;
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
