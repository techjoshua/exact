import type { ExactDevtoolsPageHook } from '@exactjs/devtools-runtime';
import type { ExactInspectionSubscriptionHandle } from '@exactjs/devtools-protocol';
import type { ExactExtensionRequest, ExactExtensionResponse } from './messages.js';

const source = 'exact-devtools-extension';
const pageSource = 'exact-devtools-page';
const subscriptions = new Map<string, ExactInspectionSubscriptionHandle>();

window.addEventListener('message', (event) => {
	if (event.source !== window || event.data?.source !== source) return;
	void dispatch(event.data.message as ExactExtensionRequest);
});

async function dispatch(message: ExactExtensionRequest): Promise<void> {
	const hook = (globalThis as any)[Symbol.for('@exactjs/devtools-hook')] as
		| ExactDevtoolsPageHook
		| undefined;
	if (!hook || hook.protocol !== 1) {
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

function respond(message: ExactExtensionResponse): void {
	window.postMessage({ source: pageSource, message }, '*');
}
