import {
	isExactRuntimeInspectionEvent,
	type ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';

const bridgeSymbol = Symbol.for('@exactjs/server-observation-bridge');
const observationsKey = '__exactObservations';

/** Browser-only bridge installed while one DevTools session is attached to the page. */
export type ExactServerObservationBridge = Readonly<{
	readonly sessionId: string;
	publish(event: ExactRuntimeInspectionEvent): void;
}>;

type BridgeHost = typeof globalThis & { [bridgeSymbol]?: ExactServerObservationBridge };

/** Installs the active page-owned server-observation bridge and returns an exact release. */
export function setExactServerObservationBridge(bridge: ExactServerObservationBridge): () => void {
	const host = globalThis as BridgeHost;
	if (host[bridgeSymbol] && host[bridgeSymbol] !== bridge)
		throw new Error('An eXact server observation bridge is already installed');
	host[bridgeSymbol] = bridge;
	return () => {
		if (host[bridgeSymbol] === bridge) Reflect.deleteProperty(host, bridgeSymbol);
	};
}

/** Returns the internal request header only while browser DevTools is attached. */
export function exactServerObservationRequestHeaders(): Readonly<Record<string, string>> {
	const sessionId = (globalThis as BridgeHost)[bridgeSymbol]?.sessionId;
	return sessionId ? { 'x-exact-debug-session': sessionId } : {};
}

/** Removes and publishes a bounded observation attachment from one JSON response envelope. */
export function consumeExactServerObservations(value: unknown): unknown {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
	const record = value as Record<string, unknown>;
	if (!Object.hasOwn(record, observationsKey)) return value;
	const descriptors = Object.getOwnPropertyDescriptors(record);
	const observationDescriptor = descriptors[observationsKey];
	if (!observationDescriptor || !('value' in observationDescriptor)) return value;
	publishObservations(observationDescriptor.value);
	delete descriptors[observationsKey];
	const copy = Object.create(Object.getPrototypeOf(record));
	Object.defineProperties(copy, descriptors);
	return copy;
}

/** Publishes a request-scoped observation array after validating every protocol event. */
export function publishExactServerObservations(value: unknown): void {
	publishObservations(value);
}

function publishObservations(value: unknown): void {
	if (!Array.isArray(value)) return;
	const bridge = (globalThis as BridgeHost)[bridgeSymbol];
	if (!bridge) return;
	for (const event of value) {
		if (!isExactRuntimeInspectionEvent(event) || event.id.sessionId !== bridge.sessionId) continue;
		try {
			bridge.publish(event);
		} catch {
			// DevTools observation cannot change application response processing.
		}
	}
}

/** Reserved response property used only between the server collector and hydration transport. */
export const EXACT_SERVER_OBSERVATIONS_KEY = observationsKey;
