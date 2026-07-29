import {
	parseExactInspectionRequest,
	parseExactInspectionSubscription,
	type ExactInspectionQueryService,
	type ExactInspectionRequest,
	type ExactInspectionResponse,
	type ExactInspectionSubscription,
	type ExactInspectionSubscriptionHandle,
	type ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';
import { connectExactCdp, type ExactCdpConnectionOptions, type ExactCdpTransport } from './cdp.js';

const bindingName = '__exactDevtoolsAgentBinding';
const objectGroup = 'exact-devtools-agent';

/** Connected agent query service plus deterministic CDP cleanup. */
export interface ExactDevtoolsAgentConnection extends ExactInspectionQueryService {
	readonly sessionId: string;
	disconnect(): Promise<void>;
}

/** Attaches to one existing Chromium target and connects to its eXact page hook. */
export async function connectExactDevtoolsAgent(
	options: ExactCdpConnectionOptions
): Promise<ExactDevtoolsAgentConnection> {
	const cdp = await connectExactCdp(options);
	await cdp.request('Runtime.enable');
	const hook = await evaluateHook(cdp);
	await cdp.request('Runtime.addBinding', { name: bindingName });
	const eventListeners = new Map<
		string,
		(event: ExactRuntimeInspectionEvent) => void
	>();
	const removeEventListener = cdp.onEvent((method, params) => {
		if (method !== 'Runtime.bindingCalled' || !bindingPayload(params)) return;
		if (params.name !== bindingName) return;
		try {
			const message = JSON.parse(params.payload) as {
				subscriptionId?: unknown;
				event?: ExactRuntimeInspectionEvent;
			};
			if (typeof message.subscriptionId !== 'string' || !message.event) return;
			eventListeners.get(message.subscriptionId)?.(message.event);
		} catch {
			// Malformed page messages are ignored and never reflected into CDP evaluation.
		}
	});
	const connected = await callHook<{ id: string }>(cdp, hook, connectFunction);
	const subscriptions = new Map<string, ExactInspectionSubscriptionHandle>();
	let disconnected = false;
	let nextSubscription = 1;
	const connection: ExactDevtoolsAgentConnection = {
		sessionId: connected.id,
		async request(untrusted) {
			if (disconnected) throw new Error('eXact DevTools agent is disconnected');
			const request = parseExactInspectionRequest(untrusted);
			return callHook<ExactInspectionResponse>(cdp, hook, requestFunction, [request]);
		},
		subscribe(request, listener) {
			if (disconnected) return closedSubscription();
			try {
				request = parseExactInspectionSubscription(request);
			} catch {
				return closedSubscription();
			}
			if (request.sessionId !== connected.id) return closedSubscription();
			const subscriptionId = `agent-${nextSubscription++}`;
			let closed = false;
			eventListeners.set(subscriptionId, listener);
			void callHook(cdp, hook, subscribeFunction, [subscriptionId, request]).catch(() => {
				eventListeners.delete(subscriptionId);
				closed = true;
			});
			const handle: ExactInspectionSubscriptionHandle = Object.freeze({
				get closed() {
					return closed;
				},
				close() {
					if (closed) return;
					closed = true;
					eventListeners.delete(subscriptionId);
					subscriptions.delete(subscriptionId);
					void callHook(cdp, hook, unsubscribeFunction, [subscriptionId]).catch(
						() => undefined
					);
				}
			});
			subscriptions.set(subscriptionId, handle);
			return handle;
		},
		async disconnect() {
			if (disconnected) return;
			disconnected = true;
			for (const subscription of subscriptions.values()) subscription.close();
			subscriptions.clear();
			eventListeners.clear();
			removeEventListener();
			await callHook(cdp, hook, disconnectFunction).catch(() => undefined);
			await cdp.request('Runtime.removeBinding', { name: bindingName }).catch(() => undefined);
			await cdp.request('Runtime.releaseObjectGroup', { objectGroup }).catch(() => undefined);
			await cdp.close();
		}
	};
	return Object.freeze(connection);
}

async function evaluateHook(cdp: ExactCdpTransport): Promise<string> {
	const response = await cdp.request<{
		result?: { objectId?: string; subtype?: string };
		exceptionDetails?: unknown;
	}>('Runtime.evaluate', {
		expression: `globalThis[Symbol.for('@exactjs/devtools-hook')]`,
		objectGroup,
		returnByValue: false
	});
	const objectId = response.result?.objectId;
	if (!objectId || response.result?.subtype === 'null' || response.exceptionDetails)
		throw new Error('The Chromium target has no eXact DevTools hook');
	return objectId;
}

async function callHook<Result>(
	cdp: ExactCdpTransport,
	objectId: string,
	functionDeclaration: string,
	args: readonly unknown[] = []
): Promise<Result> {
	const response = await cdp.request<{
		result?: { value?: unknown };
		exceptionDetails?: { text?: string };
	}>('Runtime.callFunctionOn', {
		objectId,
		functionDeclaration,
		arguments: args.map((value) => ({ value })),
		awaitPromise: true,
		returnByValue: true,
		objectGroup
	});
	if (response.exceptionDetails)
		throw new Error(response.exceptionDetails.text ?? 'eXact page query failed');
	return response.result?.value as Result;
}

const connectFunction = `async function () { return await this.connect(); }`;
const requestFunction = `async function (request) { return await this.request(request); }`;
const disconnectFunction = `async function () {
	const key = Symbol.for('@exactjs/devtools-agent-subscriptions');
	for (const handle of globalThis[key]?.values?.() ?? []) handle.close();
	globalThis[key]?.clear?.();
	return await this.disconnect();
}`;
const subscribeFunction = `function (subscriptionId, request) {
	const key = Symbol.for('@exactjs/devtools-agent-subscriptions');
	const subscriptions = globalThis[key] ??= new Map();
	const handle = this.subscribe(request, event => {
		globalThis.${bindingName}(JSON.stringify({ subscriptionId, event }));
	});
	subscriptions.set(subscriptionId, handle);
	return { subscriptionId };
}`;
const unsubscribeFunction = `function (subscriptionId) {
	const subscriptions = globalThis[Symbol.for('@exactjs/devtools-agent-subscriptions')];
	subscriptions?.get(subscriptionId)?.close();
	subscriptions?.delete(subscriptionId);
}`;

function bindingPayload(
	params: unknown
): params is { name: string; payload: string } {
	return (
		typeof params === 'object' &&
		params !== null &&
		typeof (params as { name?: unknown }).name === 'string' &&
		typeof (params as { payload?: unknown }).payload === 'string'
	);
}

function closedSubscription(): ExactInspectionSubscriptionHandle {
	return Object.freeze({ closed: true, close() {} });
}
