import {
	createComponentDomain,
	createRef,
	createVNode,
	watch,
	type Child,
	type Component,
	type ComponentDomain,
	type ComponentFunction,
	type VNode
} from '@exact/core';
import { createExactClient, type ExactClient } from '@exact/hydrate';
import { createExactRoot } from '@exact/hydrate/internal';
import type { ExactRemoteModule } from './artifacts.js';
import { registerExactRemoteRecovery, type ExactRemoteRecoveryRegistration } from './recovery.js';

/** Browser-safe projection for one page-configured remote binding. */
export type ExactRemoteClientBinding = {
	clientEntry: string;
	resolveClientEntry?: (buildKey: string) => string | Promise<string>;
};

/** Props accepted by the ordinary eXact RemoteComponent wrapper. */
export type RemoteComponentProps = {
	binding: string;
	props?: Record<string, unknown>;
	children?: Child | Child[];
	fallback?: Child | Child[];
};

const bindingsSymbol = Symbol.for('@exact/microfrontends/client-bindings');
const moduleLoads = new Map<string, Promise<ExactRemoteModule>>();

type BindingHost = typeof globalThis & {
	[bindingsSymbol]?: Readonly<Record<string, ExactRemoteClientBinding>>;
};

/** Publishes the generated browser-only binding projection before remote mounts. */
export function registerExactRemoteClientBindings(
	bindings: Readonly<Record<string, ExactRemoteClientBinding>>
): void {
	const host = globalThis as BindingHost;
	if (host[bindingsSymbol] && host[bindingsSymbol] !== bindings)
		throw new Error('eXact remote client bindings are already registered');
	host[bindingsSymbol] = bindings;
}

/** Loads and validates the public shape of one canonical remote entry. */
export function loadExactRemoteModule(url: string): Promise<ExactRemoteModule> {
	if (!url) return Promise.reject(new Error('Remote client entry must be a non-empty URL'));
	let pending = moduleLoads.get(url);
	if (!pending) {
		pending = importExactRemoteModule(url)
			.then((module) => validateRemoteModule(module.default))
			.catch((error) => {
				moduleLoads.delete(url);
				throw error;
			});
		moduleLoads.set(url, pending);
	}
	return pending;
}

/** Mounts one client-loaded exposure as an ordinary logical eXact child. */
export function RemoteComponent(
	this: Component<{
		phase: 'placeholder' | 'ready' | 'failed';
		generation: number;
		reconcile: number;
	}>,
	props: RemoteComponentProps
): () => VNode {
	const containerRef = createRef<Element>('exact.remote.container');
	let remote: ExactRemoteModule | undefined;
	let client: ExactClient | undefined;
	let renderDomain: ComponentDomain | undefined;
	let recovery: ExactRemoteRecoveryRegistration | undefined;
	let stopBindingWatch: (() => void) | undefined;
	let loadGeneration = 0;
	this.state.phase = 'placeholder';
	this.state.generation = 0;
	this.state.reconcile = 0;

	this.onMount(({ signal }) => {
		const container = this.refs.get(containerRef);
		if (!container) {
			this.state.phase = 'failed';
			return;
		}
		let activeBinding: string | undefined;
		stopBindingWatch = watch(() => {
			const bindingName = props.binding;
			if (bindingName === activeBinding) return;
			activeBinding = bindingName;
			const generation = ++loadGeneration;
			recovery?.unregister();
			recovery = undefined;
			client?.dispose();
			client = undefined;
			renderDomain = undefined;
			remote = undefined;
			this.state.phase = 'placeholder';
			this.state.generation++;
			void activateBinding(bindingName, container, signal, generation);
		});
	});

	this.onUnmount(() => {
		loadGeneration++;
		stopBindingWatch?.();
		recovery?.unregister();
		client?.dispose();
	});

	const activateBinding = async (
		bindingName: string,
		container: Element,
		signal: AbortSignal,
		generation: number
	): Promise<void> => {
		const binding = (globalThis as BindingHost)[bindingsSymbol]?.[bindingName];
		if (!binding) {
			if (generation === loadGeneration) this.state.phase = 'failed';
			return;
		}
		try {
			const loaded = await loadExactRemoteModule(binding.clientEntry);
			if (signal.aborted || generation !== loadGeneration) return;
			const nextClient = installModule(bindingName, binding, loaded, container, signal, generation);
			if (signal.aborted || generation !== loadGeneration) {
				nextClient.dispose();
				return;
			}
		} catch {
			if (!signal.aborted && generation === loadGeneration) this.state.phase = 'failed';
		}
	};

	const installModule = (
		bindingName: string,
		binding: ExactRemoteClientBinding,
		loaded: ExactRemoteModule,
		container: Element,
		signal: AbortSignal,
		generation: number
	): ExactClient => {
		// Assignment follows client creation because its immutable callbacks close over
		// the final recovery registration.
		// eslint-disable-next-line prefer-const
		let nextRecovery: ExactRemoteRecoveryRegistration | undefined;
		const nextClient = createExactClient(container, {
			endpoint: '/__exact',
			executionRoot: loaded.root,
			binding: bindingName,
			buildKey: loaded.buildKey,
			signal,
			onResponse: (metadata) => nextRecovery?.response(metadata),
			onBuildUnsupported: () => nextRecovery?.unsupported(),
			onCrossRootReplacement: () => {
				if (signal.aborted || client !== nextClient) return;
				renderDomain = createComponentDomain(loaded.root);
				this.state.reconcile++;
			}
		});
		nextClient.registerManifest(loaded.registration);
		nextRecovery = registerExactRemoteRecovery(bindingName, binding, loaded, {
			client: nextClient,
			replace: (nextModule) => {
				if (signal.aborted || generation !== loadGeneration) return;
				const nextGeneration = ++loadGeneration;
				recovery?.unregister();
				nextClient.dispose();
				installModule(bindingName, binding, nextModule, container, signal, nextGeneration);
			},
			fail: () => {
				if (signal.aborted || generation !== loadGeneration) return;
				loadGeneration++;
				recovery?.unregister();
				nextClient.dispose();
				client = undefined;
				remote = undefined;
				this.state.phase = 'failed';
				this.state.generation++;
			}
		});
		recovery = nextRecovery;
		client = nextClient;
		renderDomain = nextClient.domain;
		remote = loaded;
		this.state.phase = 'ready';
		this.state.generation++;
		return nextClient;
	};

	return () => {
		// The module generation can change while the public phase remains ready.
		void this.state.generation;
		// Cross-root structural patches rotate only the remote component descriptor.
		void this.state.reconcile;
		const children =
			this.state.phase === 'ready' && remote && client
				? [
						createExactRoot(
							client,
							remote!.component as ComponentFunction<any, Record<string, unknown>>,
							props.props,
							props.children,
							renderDomain
						)
					]
				: this.state.phase === 'failed'
					? normalizeFallback(props.fallback)
					: [];
		return createVNode(
			'div',
			{
				ref: this.ref(containerRef),
				'data-exact-remote': props.binding,
				'data-exact-remote-state': this.state.phase
			},
			...children
		);
	};
}

async function importExactRemoteModule(url: string): Promise<{ default: unknown }> {
	return import(/* @vite-ignore */ url) as Promise<{ default: unknown }>;
}

function validateRemoteModule(value: unknown): ExactRemoteModule {
	if (!value || typeof value !== 'object') throw new Error('Invalid eXact remote module');
	const module = value as Partial<ExactRemoteModule>;
	if (
		!/^[0-9a-f]{40}$/i.test(module.buildKey ?? '') ||
		!module.root ||
		typeof module.component !== 'function' ||
		!module.registration ||
		typeof module.registration !== 'object'
	)
		throw new Error('Invalid eXact remote module');
	return module as ExactRemoteModule;
}

function normalizeFallback(value: Child | Child[] | undefined): Child[] {
	return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
