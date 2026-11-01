import {
	type ExactInspectionRequest,
	type ExactInspectionResponse,
	type ExactInspectionSessionDescription,
	type ExactInspectionSubscription,
	type ExactInspectionSubscriptionHandle
} from '@exactjs/devtools-protocol';
import { createExactRuntimeInspectionOwner } from '@exactjs/core';
import { setExactServerObservationBridge } from '@exactjs/core/framework/inspection-transport';
import { createExactDomInspectionHost, setExactDomInspectionOwnerFactory } from '@exactjs/dom';
import { createExactClientEventStore, type ExactClientEventStore } from './client-events.js';
import type {
	ExactDevtoolsPageHook,
	ExactDevtoolsRuntimeInstallation,
	ExactDevtoolsRuntimeOptions
} from './contracts.js';
import { createExactClientInspectionQueryService } from './query-service.js';
import { createExactBrowserServerInspectionClient } from './server-client.js';

/** Global page-world hook detected by the Chromium extension and CDP adapter. */
export const exactDevtoolsHookSymbol = Symbol.for('@exactjs/devtools-hook');

/** Installs one read-only page bridge and owns all attached client/server resources. */
export function installExactDevtoolsRuntime(
	options: ExactDevtoolsRuntimeOptions = {}
): ExactDevtoolsRuntimeInstallation {
	const dom = createExactDomInspectionHost();
	let connected = false;
	let disposed = false;
	let connectionGeneration = 0;
	let connecting: Promise<ExactInspectionSessionDescription> | undefined;
	let disposal: Promise<void> | undefined;
	let serverConnected = false;
	let session: ExactInspectionSessionDescription | undefined;
	let events: ExactClientEventStore | undefined;
	let clearServerObservationBridge: (() => void) | undefined;
	const owners = new Map<string, ReturnType<typeof createExactRuntimeInspectionOwner>>();
	const inspectionOwner = (
		input: Readonly<{ buildKey?: string; executionRoot?: string; binding?: string }>
	) => {
		const buildKey = input.buildKey ?? options.buildKey ?? 'development';
		const executionRoot = input.executionRoot ?? options.executionRoot ?? 'page';
		const binding = input.binding ?? options.binding;
		const key = JSON.stringify([binding ?? '', buildKey, executionRoot]);
		let owner = owners.get(key);
		if (!owner) {
			owner = createExactRuntimeInspectionOwner({
				buildKey,
				executionRoot,
				...(binding ? { binding } : {}),
				side: 'client'
			});
			owners.set(key, owner);
			if (session && events) owner.attach(session.id, events);
		}
		return owner;
	};
	const inspection = inspectionOwner({});
	const clearInspectionFactory = setExactDomInspectionOwnerFactory(inspectionOwner);
	const serverEndpoint = resolveServerEndpoint(options.endpoint);
	const server = serverEndpoint
		? createExactBrowserServerInspectionClient(
				serverEndpoint,
				options.fetch ?? globalThis.fetch.bind(globalThis)
			)
		: undefined;
	let service: ReturnType<typeof createExactClientInspectionQueryService> | undefined;
	let highlightTimer: ReturnType<typeof setTimeout> | undefined;
	const highlighted = new Map<
		HTMLElement,
		Readonly<{ outline: string; priority: string; appliedOutline: string; appliedPriority: string }>
	>();
	const subscriptions = new Set<() => void>();
	const hook: ExactDevtoolsPageHook = {
		protocol: 1,
		get connected() {
			return connected;
		},
		connect,
		disconnect,
		ownerOfElement(element) {
			return connected ? dom.ownerOfElement(element) : undefined;
		},
		highlight(identity) {
			if (!connected || identity.sessionId !== session?.id) return;
			clearHighlight();
			const elements = dom.ownedElements(identity);
			for (const element of elements) {
				element.setAttribute('data-exact-devtools-highlight', '');
				const html = element as HTMLElement;
				const previous = {
					outline: html.style.getPropertyValue('outline'),
					priority: html.style.getPropertyPriority('outline')
				};
				html.style.setProperty('outline', '2px solid #7c3aed');
				highlighted.set(html, {
					...previous,
					appliedOutline: html.style.getPropertyValue('outline'),
					appliedPriority: html.style.getPropertyPriority('outline')
				});
			}
			highlightTimer = setTimeout(clearHighlight, positive(options.highlightDurationMs, 2_000));
		},
		clearHighlight,
		async request(request: ExactInspectionRequest): Promise<ExactInspectionResponse> {
			if (!service) await connect();
			return service!.request(request);
		},
		subscribe(
			request: ExactInspectionSubscription,
			listener: Parameters<ExactDevtoolsPageHook['subscribe']>[1]
		): ExactInspectionSubscriptionHandle {
			if (!service) return { closed: true, close() {} };
			const owned = service.subscribe(request, listener);
			const close = () => {
				owned.close();
				subscriptions.delete(close);
			};
			const handle: ExactInspectionSubscriptionHandle = {
				get closed() {
					return owned.closed;
				},
				close
			};
			subscriptions.add(close);
			return handle;
		}
	};
	Object.defineProperty(globalThis, exactDevtoolsHookSymbol, {
		configurable: true,
		enumerable: false,
		value: hook,
		writable: false
	});
	return {
		hook,
		inspection,
		dispose() {
			if (disposal) return disposal;
			disposed = true;
			disposal = (async () => {
				try {
					await disconnect();
				} finally {
					clearInspectionFactory();
					if (Reflect.get(globalThis, exactDevtoolsHookSymbol) === hook)
						Reflect.deleteProperty(globalThis, exactDevtoolsHookSymbol);
				}
			})();
			return disposal;
		}
	};

	/** Owns shared session opening and publication independently of public method aliases. */
	function connect() {
		if (disposed)
			return Promise.reject(new DOMException('DevTools installation is disposed', 'AbortError'));
		if (session) return Promise.resolve(sessionDescription(session));
		if (connecting) return connecting;
		const generation = connectionGeneration;
		const attempt = connectSession(generation).finally(() => {
			if (connecting === attempt) connecting = undefined;
		});
		connecting = attempt;
		return attempt;
	}

	/** Owns session retirement and resource cleanup independently of public method aliases. */
	async function disconnect() {
		connectionGeneration++;
		connecting = undefined;
		if (!session) return;
		const closing = session;
		const closeRemote = serverConnected;
		for (const close of subscriptions) close();
		subscriptions.clear();
		dom.detach(session.id);
		for (const owner of owners.values()) owner.detach(session.id);
		clearServerObservationBridge?.();
		clearServerObservationBridge = undefined;
		events?.clear();
		clearHighlight();
		session = undefined;
		events = undefined;
		service = undefined;
		serverConnected = false;
		connected = false;
		if (server && closeRemote) await server.close(closing.id);
	}

	/** Publishes only the opening generation that still owns this installation. */
	async function connectSession(generation: number): Promise<ExactInspectionSessionDescription> {
		const remote = await server?.open(['catalog', 'snapshot', 'events', 'source']);
		if (disposed || generation !== connectionGeneration) {
			if (remote && server) await server.close(remote.id);
			throw new DOMException('DevTools connection was closed while opening', 'AbortError');
		}
		serverConnected = !!remote;
		session = remote ?? localSession();
		events = createExactClientEventStore(
			positive(options.maxEvents, 10_000),
			positive(options.maxEventBytes, 2 * 1024 * 1024)
		);
		if (serverConnected)
			clearServerObservationBridge = setExactServerObservationBridge({
				sessionId: session.id,
				publish: (event) => events?.publish(event)
			});
		dom.attach(session.id, events);
		for (const owner of owners.values()) owner.attach(session.id, events);
		service = createExactClientInspectionQueryService({
			sessionId: session.id,
			dom,
			events,
			server,
			serverConnected
		});
		connected = true;
		return sessionDescription(session);
	}

	function clearHighlight(): void {
		if (highlightTimer) clearTimeout(highlightTimer);
		highlightTimer = undefined;
		for (const [element, previous] of highlighted) {
			element.removeAttribute('data-exact-devtools-highlight');
			// A later authored outline owns its value and must survive inspection cleanup.
			if (
				element.style.getPropertyValue('outline') === previous.appliedOutline &&
				element.style.getPropertyPriority('outline') === previous.appliedPriority
			)
				element.style.setProperty('outline', previous.outline, previous.priority);
		}
		highlighted.clear();
	}
}

/** Publishes an ordinary description without exposing retained session correlation or capabilities. */
function sessionDescription(
	session: ExactInspectionSessionDescription
): ExactInspectionSessionDescription {
	return { ...session, capabilities: [...session.capabilities] };
}

function localSession(): ExactInspectionSessionDescription {
	const now = Date.now();
	const bytes = new Uint8Array(16);
	globalThis.crypto.getRandomValues(bytes);
	return {
		id: `client-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`,
		protocol: 1,
		openedAt: now,
		expiresAt: now + 30 * 60_000,
		capabilities: ['snapshot', 'events'] as const
	};
}

/**
 * Resolves optional server cooperation without probing a conventional URL on client-only pages.
 * Explicit configuration wins; otherwise only compiler-owned hydration metadata may opt the page
 * into debug transport discovery.
 */
function resolveServerEndpoint(explicit: string | undefined): string | undefined {
	const configured = validEndpoint(explicit);
	if (configured) return configured;
	if (typeof document === 'undefined') return undefined;
	const script = document.getElementById('__exact_hydration');
	if (!script || script.tagName !== 'SCRIPT' || script.getAttribute('type') !== 'application/json')
		return undefined;
	try {
		const source = script.textContent ?? '';
		if (source.length > 16 * 1024 * 1024) return undefined;
		const parsed = JSON.parse(source) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
		return validEndpoint((parsed as { endpoint?: unknown }).endpoint);
	} catch {
		return undefined;
	}
}

function validEndpoint(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 && value.length <= 2_048 ? value : undefined;
}

function positive(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
