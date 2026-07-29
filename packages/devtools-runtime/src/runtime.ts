import {
	type ExactInspectionRequest,
	type ExactInspectionResponse,
	type ExactInspectionRuntimeId,
	type ExactInspectionSessionDescription,
	type ExactInspectionSubscription,
	type ExactInspectionSubscriptionHandle
} from '@exactjs/devtools-protocol';
import { createExactDomInspectionHost } from '@exactjs/dom';
import { createExactClientEventStore, type ExactClientEventStore } from './client-events.js';
import type {
	ExactClientCorrelationRuntime,
	ExactClientSourceCorrelation,
	ExactDevtoolsPageHook,
	ExactDevtoolsRuntimeInstallation,
	ExactDevtoolsRuntimeOptions
} from './contracts.js';
import { createExactClientInspectionQueryService } from './query-service.js';
import {
	createExactBrowserServerInspectionClient,
	type ExactBrowserServerInspectionClient
} from './server-client.js';

/** Global symbol used only by instrumented client output to register compact source slots. */
export const exactDevtoolsRuntimeSymbol = Symbol.for('@exactjs/devtools-runtime');

/** Global page-world hook detected by the Chromium extension and CDP adapter. */
export const exactDevtoolsHookSymbol = Symbol.for('@exactjs/devtools-hook');

/** Installs one read-only page bridge and owns all attached client/server resources. */
export function installExactDevtoolsRuntime(
	options: ExactDevtoolsRuntimeOptions = {}
): ExactDevtoolsRuntimeInstallation {
	const runtime = correlationRuntime();
	const dom = createExactDomInspectionHost();
	const server = createExactBrowserServerInspectionClient(
		options.endpoint ?? '/__exact',
		options.fetch ?? globalThis.fetch.bind(globalThis)
	);
	let connected = false;
	let session: ExactInspectionSessionDescription | undefined;
	let events: ExactClientEventStore | undefined;
	let service: ReturnType<typeof createExactClientInspectionQueryService> | undefined;
	let highlightTimer: ReturnType<typeof setTimeout> | undefined;
	const subscriptions = new Set<ExactInspectionSubscriptionHandle>();
	const hook: ExactDevtoolsPageHook = {
		protocol: 1,
		get connected() {
			return connected;
		},
		async connect() {
			if (session) return session;
			const remote = await server.open(['catalog', 'snapshot', 'events', 'source']);
			session = remote ?? localSession();
			events = createExactClientEventStore(
				positive(options.maxEvents, 10_000),
				positive(options.maxEventBytes, 2 * 1024 * 1024)
			);
			dom.attach(session.id, events);
			service = createExactClientInspectionQueryService({
				sessionId: session.id,
				dom,
				events,
				correlations: runtime.sources,
				server,
				serverConnected: !!remote
			});
			connected = true;
			return session;
		},
		async disconnect() {
			if (!session) return;
			for (const subscription of subscriptions) subscription.close();
			subscriptions.clear();
			dom.detach(session.id);
			events?.clear();
			clearHighlight();
			if (session && service) await server.close(session.id);
			session = undefined;
			events = undefined;
			service = undefined;
			connected = false;
		},
		ownerOfElement(element) {
			return connected ? dom.ownerOfElement(element) : undefined;
		},
		highlight(identity) {
			clearHighlight();
			const elements = dom.ownedElements(identity);
			for (const element of elements) {
				element.setAttribute('data-exact-devtools-highlight', '');
				(element as HTMLElement).style.outline = '2px solid #7c3aed';
			}
			highlightTimer = setTimeout(
				clearHighlight,
				positive(options.highlightDurationMs, 2_000)
			);
		},
		clearHighlight,
		async request(request: ExactInspectionRequest): Promise<ExactInspectionResponse> {
			if (!service) await hook.connect();
			return service!.request(request);
		},
		subscribe(
			request: ExactInspectionSubscription,
			listener: Parameters<ExactDevtoolsPageHook['subscribe']>[1]
		): ExactInspectionSubscriptionHandle {
			if (!service) return Object.freeze({ closed: true, close() {} });
			const owned = service.subscribe(request, listener);
			const handle: ExactInspectionSubscriptionHandle = Object.freeze({
				get closed() {
					return owned.closed;
				},
				close() {
					owned.close();
					subscriptions.delete(handle);
				}
			});
			subscriptions.add(handle);
			return handle;
		}
	};
	Object.defineProperty(globalThis, exactDevtoolsHookSymbol, {
		configurable: true,
		enumerable: false,
		value: Object.freeze(hook),
		writable: false
	});
	return Object.freeze({
		hook,
		async dispose() {
			await hook.disconnect();
			if ((globalThis as any)[exactDevtoolsHookSymbol] === hook)
				delete (globalThis as any)[exactDevtoolsHookSymbol];
		}
	});

	function clearHighlight(): void {
		if (highlightTimer) clearTimeout(highlightTimer);
		highlightTimer = undefined;
		for (const element of document.querySelectorAll('[data-exact-devtools-highlight]')) {
			element.removeAttribute('data-exact-devtools-highlight');
			(element as HTMLElement).style.removeProperty('outline');
		}
	}
}

function correlationRuntime(): ExactClientCorrelationRuntime {
	const global = globalThis as typeof globalThis & {
		[exactDevtoolsRuntimeSymbol]?: ExactClientCorrelationRuntime;
	};
	const existing = global[exactDevtoolsRuntimeSymbol];
	if (existing) return existing;
	const sources: ExactClientSourceCorrelation[] = [];
	const runtime: ExactClientCorrelationRuntime = {
		sources,
		registerSource(source) {
			if (source?.protocol === 1) sources.push(Object.freeze(source));
		}
	};
	global[exactDevtoolsRuntimeSymbol] = runtime;
	return runtime;
}

function localSession(): ExactInspectionSessionDescription {
	const now = Date.now();
	const bytes = new Uint8Array(16);
	globalThis.crypto.getRandomValues(bytes);
	return Object.freeze({
		id: `client-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`,
		protocol: 1,
		openedAt: now,
		expiresAt: now + 30 * 60_000,
		capabilities: Object.freeze(['snapshot', 'events'] as const)
	});
}

function positive(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
