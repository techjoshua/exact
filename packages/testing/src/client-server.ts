import { flushSync } from '@exactjs/reactive';
import {
	createExactClient,
	readExactHydrationConfig,
	type ClientIslandRegistry,
	type ExactClient,
	type ExactHydrationObservation,
	type FetchLike,
	type HydrateOptions
} from '@exactjs/hydrate';
import type { ComponentInstance } from '@exactjs/core';
import type { ExactRequestLike, ExactResponseLike } from '@exactjs/server';
import { inspectDomRoot, type DomInspectionNode } from '@exactjs/dom/testing';

import type { ActionOptions, PropsOf, StateOf } from './contracts.js';
import { TestComponent, type ComponentTestView } from './mounting/views.js';
import { ExactProtocolRecorder } from './protocol.js';
import { QueryHost, allElements } from './queries/host.js';

/** Configures a real in-memory client/server component test. */
export type ClientServerRenderOutput = {
	readonly html: string;
	readonly htmlWithHydration?: string;
};

/** Configures a real in-memory client/server component test. */
export type ClientServerTestOptions = {
	server:
		| ClientServerRenderOutput
		| Promise<ClientServerRenderOutput>
		| (() => ClientServerRenderOutput | Promise<ClientServerRenderOutput>);
	handle(request: ExactRequestLike): ExactResponseLike | Promise<ExactResponseLike>;
	islands: ClientIslandRegistry;
	hydrate?: Omit<HydrateOptions, 'fetch' | 'islands'>;
	container?: Element;
	attachToDocument?: boolean;
	timeout?: number;
	/** Reuses a recorder so the server's value-free context-access callback can target it. */
	protocol?: ExactProtocolRecorder;
};

/** Represents a hydrated client paired with its actual in-memory server protocol. */
export class ClientServerTestView extends QueryHost implements ComponentTestView {
	readonly protocol: ExactProtocolRecorder;
	readonly client: ExactClient;
	readonly hydratedIslands: number;
	readonly hydration: readonly ExactHydrationObservation[];
	private disposed = false;
	private readonly removeContainer: boolean;
	private readonly timeout: number;

	private constructor(
		readonly container: Element,
		readonly server: ClientServerRenderOutput,
		client: ExactClient,
		protocol: ExactProtocolRecorder,
		hydration: readonly ExactHydrationObservation[],
		hydratedIslands: number,
		removeContainer: boolean,
		timeout: number
	) {
		super(
			() => allElements(container),
			async (work, options) => this.action(work, options)
		);
		this.client = client;
		this.protocol = protocol;
		this.hydration = hydration;
		this.hydratedIslands = hydratedIslands;
		this.removeContainer = removeContainer;
		this.timeout = timeout;
	}

	/** Hydrates supplied server output and waits for initial client and protocol work to settle. */
	static async mount(options: ClientServerTestOptions): Promise<ClientServerTestView> {
		const server =
			typeof options.server === 'function' ? await options.server() : await options.server;
		const container = options.container ?? document.createElement('div');
		const attached = !options.container && options.attachToDocument !== false;
		if (attached) document.body.appendChild(container);
		container.innerHTML = server.htmlWithHydration ?? server.html;
		const protocol = options.protocol ?? new ExactProtocolRecorder();
		const transport: FetchLike = async (url, init) => {
			const body = parseBody(init.body);
			const response = await options.handle({
				method: init.method,
				url,
				headers: init.headers,
				body,
				text: async () => init.body,
				json: async () => body,
				signal: init.signal
			});
			return {
				ok: response.status >= 200 && response.status < 300,
				status: response.status,
				headers: response.headers,
				body: response.stream,
				json: async () => parseBody(response.body),
				text: async () => response.body
			};
		};
		const explicit = options.hydrate ?? {};
		const config = readExactHydrationConfig(container, undefined, explicit.configLimits);
		const transports = Object.fromEntries(
			Object.entries(explicit.transports ?? {}).map(([endpoint, configured]) => [
				endpoint,
				{ ...configured, fetch: protocol.wrap(transport) }
			])
		);
		let client: ExactClient | undefined;
		const hydration: ExactHydrationObservation[] = [];
		try {
			client = createExactClient(container, {
				...config,
				...explicit,
				islands: options.islands,
				fetch: protocol.wrap(transport),
				transports,
				onOperation: (observation) => {
					protocol.observeClientOperation(observation);
					explicit.onOperation?.(observation);
				},
				onHydration: (observation) => {
					hydration.push(observation);
					explicit.onHydration?.(observation);
				}
			});
			const hydrated = hydration.length;
			const view = new ClientServerTestView(
				container,
				server,
				client,
				protocol,
				hydration,
				hydrated,
				attached,
				options.timeout ?? 1_000
			);
			await view.settle();
			return view;
		} catch (error) {
			client?.dispose();
			if (attached) container.remove();
			throw error;
		}
	}

	/** Returns the live test container, throwing after the view has been unmounted. */
	snapshot(): Element {
		if (this.disposed) throw new Error('The client/server test view has been unmounted');
		return this.container;
	}
	/** Locates the inspected DOM node currently owned by a component instance. */
	nodeFor(instance: ComponentInstance<any>): DomInspectionNode | undefined {
		for (const root of this.clientRoots())
			for (const node of componentNodes(root)) if (node.instance === instance) return node;
		return undefined;
	}
	/** Wraps a mounted component instance with component-scoped test operations. */
	componentFor(instance: ComponentInstance<any>): TestComponent<any, any> {
		if (!this.nodeFor(instance))
			throw new Error(`Component ${instance.type.name || instance.id} is not mounted in this view`);
		return new TestComponent(this, instance);
	}
	/** Reports whether a component instance remains mounted in this hydrated view. */
	hasComponent(instance: ComponentInstance<any>): boolean {
		return !!this.nodeFor(instance);
	}
	/** Returns the sole mounted component of a type or throws when the match is ambiguous. */
	component<C extends import('@exactjs/core').ComponentFunction<any, any>>(
		type: C
	): TestComponent<StateOf<C>, PropsOf<C>> {
		const components = this.components(type);
		if (components.length !== 1)
			throw new Error(
				`Expected exactly one hydrated component ${type.name || 'anonymous'}, found ${components.length}`
			);
		return components[0]!;
	}
	/** Returns every mounted component whose runtime type matches the requested component. */
	components<C extends import('@exactjs/core').ComponentFunction<any, any>>(
		type: C
	): TestComponent<StateOf<C>, PropsOf<C>>[] {
		return this.clientRoots()
			.flatMap(componentNodes)
			.filter((node) => node.instance?.type === type)
			.map((node) => this.componentFor(node.instance!) as TestComponent<StateOf<C>, PropsOf<C>>);
	}
	/** Runs a synchronous interaction, flushes reactivity, and settles owned work by default. */
	async action(work: () => unknown, options: ActionOptions = {}): Promise<void> {
		this.snapshot();
		work();
		flushSync();
		if (options.settleTasks !== false) await this.settle();
	}
	/** Waits for client operations and consumed protocol streams, subject to the configured timeout. */
	async settle(): Promise<void> {
		this.snapshot();
		const work = Promise.all([this.client.whenSettled(), this.protocol.settle()]).then(() => {
			flushSync();
		});
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				work,
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() =>
							reject(
								new Error(`Timed out settling eXact client/server work after ${this.timeout}ms`)
							),
						this.timeout
					);
				})
			]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}
	/** Disposes the client and removes a container created by the test harness. */
	unmount(): void {
		if (this.disposed) return;
		this.disposed = true;
		try {
			this.client.dispose();
		} finally {
			if (this.removeContainer) this.container.remove();
		}
	}
	protected ownerView(): ClientServerTestView {
		return this;
	}
	private clientRoots(): DomInspectionNode[] {
		this.snapshot();
		const roots: DomInspectionNode[] = [];
		for (const boundary of this.container.querySelectorAll('[data-exact-client-hydrated="true"]')) {
			const root = inspectDomRoot(boundary);
			if (root) roots.push(root);
		}
		return roots;
	}
}

/** Mounts hydratable server output against a real in-memory request handler. */
export function mountClientServerTest(
	options: ClientServerTestOptions
): Promise<ClientServerTestView> {
	return ClientServerTestView.mount(options);
}

function parseBody(body: string): unknown {
	try {
		return JSON.parse(body);
	} catch {
		return body;
	}
}

function componentNodes(root: DomInspectionNode): DomInspectionNode[] {
	return [root, ...root.children.flatMap(componentNodes)].filter((node) => !!node.instance);
}
