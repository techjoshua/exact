import type { ExactDevtoolsPageHook } from '@exactjs/devtools-runtime';
import type { ExactInspectionSubscriptionHandle } from '@exactjs/devtools-protocol';
import type {
	ExactExtensionRequest,
	ExactExtensionResponse,
	ExactPageBridgeDisconnect,
	ExactPageBridgeHello,
	ExactPageBridgeReady
} from './messages.js';

const source = 'exact-devtools-extension';
const pageSource = 'exact-devtools-page';
const subscriptions = new Map<string, ExactInspectionSubscriptionHandle>();
const bridgeId = crypto.randomUUID();
let activeDocumentId: string | undefined;

window.addEventListener('message', (event) => {
	if (event.source !== window || event.data?.source !== source) return;
	const control = event.data.control as
		| ExactPageBridgeHello
		| ExactPageBridgeDisconnect
		| undefined;
	if (control?.type === 'hello') {
		void greet(control);
		return;
	}
	if (control?.type === 'transport-disconnect') {
		if (control.documentId === activeDocumentId) void releaseRuntime();
		return;
	}
	void dispatch(event.data.message as ExactExtensionRequest);
});

async function greet(message: ExactPageBridgeHello): Promise<void> {
	if (activeDocumentId && activeDocumentId !== message.documentId) await releaseRuntime();
	activeDocumentId = message.documentId;
	const hook = readHook();
	const ready: ExactPageBridgeReady = {
		type: 'ready',
		documentId: message.documentId,
		bridgeId,
		runtimeReady: hook?.protocol === 1,
		...(hook ? { protocol: hook.protocol } : {})
	};
	window.postMessage({ source: pageSource, control: ready }, '*');
}

async function dispatch(message: ExactExtensionRequest): Promise<void> {
	const hook = readHook();
	if (!hook || hook.protocol !== 1) {
		if (activeDocumentId) void greet({ type: 'hello', documentId: activeDocumentId });
		respond({ id: message.id, ok: false, error: 'runtime-not-instrumented' });
		return;
	}
	try {
		if (message.type === 'connect') {
			respond({ id: message.id, ok: true, result: await hook.connect() });
		} else if (message.type === 'disconnect') {
			for (const subscription of subscriptions.values()) subscription.close();
			subscriptions.clear();
			await hook.disconnect();
			respond({ id: message.id, ok: true });
		} else if (message.type === 'query') {
			respond({ id: message.id, ok: true, result: await hook.request(message.request) });
		} else if (message.type === 'subscribe') {
			const handle = hook.subscribe(
				{
					protocol: 1,
					sessionId: message.sessionId,
					cursor: message.cursor
				},
				(runtimeEvent) =>
					respond({ type: 'event', subscriptionId: message.id, event: runtimeEvent })
			);
			subscriptions.set(message.id, handle);
			respond({ id: message.id, ok: true, result: { subscriptionId: message.id } });
		} else if (message.type === 'unsubscribe') {
			subscriptions.get(message.subscriptionId)?.close();
			subscriptions.delete(message.subscriptionId);
			respond({ id: message.id, ok: true });
		} else if (message.type === 'highlight') {
			hook.highlight(message.identity as never);
			respond({ id: message.id, ok: true });
		}
	} catch (error) {
		respond({
			id: message.id,
			ok: false,
			error: error instanceof Error ? error.message : 'inspection-failed'
		});
	}
}

function readHook(): ExactDevtoolsPageHook | undefined {
	return Reflect.get(globalThis, Symbol.for('@exactjs/devtools-hook')) as
		| ExactDevtoolsPageHook
		| undefined;
}

async function releaseRuntime(): Promise<void> {
	for (const subscription of subscriptions.values()) subscription.close();
	subscriptions.clear();
	activeDocumentId = undefined;
	await readHook()
		?.disconnect()
		.catch(() => undefined);
}

function respond(message: ExactExtensionResponse): void {
	window.postMessage({ source: pageSource, message }, '*');
}
