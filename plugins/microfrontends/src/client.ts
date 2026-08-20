import {
	createComponentDomain,
	createRef,
	createVNode,
	isExactComponentAuthorizationIdentity,
	watch,
	type Child,
	type Component,
	type ComponentDomain,
	type ComponentFunction,
	type VNode
} from '@exactjs/core';
import { markExactComponent } from '@exactjs/core/framework/component-contracts';
import { createExactClient, type ExactClient } from '@exactjs/hydrate';
import { createExactRoot } from '@exactjs/hydrate/internal';
import type { ExactRemoteModule } from './artifacts.js';
import { registerExactRemoteRecovery, type ExactRemoteRecoveryRegistration } from './recovery.js';

/** Browser-safe projection for one page-configured remote binding. */
export type ExactRemoteClientBinding = {
	clientEntry: string;
	integrity?: string;
	resolveClientEntry?: (
		buildKey: string
	) => ExactRemoteClientEntry | Promise<ExactRemoteClientEntry>;
};

/** One recovery-safe browser entry and its optional browser-enforced integrity pin. */
export type ExactRemoteClientEntry = string | Readonly<{ clientEntry: string; integrity?: string }>;

/** Props accepted by the ordinary eXact RemoteComponent wrapper. */
export type RemoteComponentProps = {
	binding: string;
	props?: Record<string, unknown>;
	children?: Child | Child[];
	fallback?: Child | Child[];
};

const bindingsSymbol = Symbol.for('@exactjs/microfrontends/client-bindings');
const remoteLoaderSymbol = Symbol.for('@exactjs/microfrontends/remote-loader');
const moduleLoads = new Map<string, Promise<ExactRemoteModule>>();
const maxModuleLoads = 64;

type BindingHost = typeof globalThis & {
	[bindingsSymbol]?: Readonly<Record<string, ExactRemoteClientBinding>>;
	[remoteLoaderSymbol]?: ExactRemoteIntegrityLoader;
};

type ExactRemoteIntegrityLoader = Readonly<{
	load(url: string, integrity: string): Promise<unknown>;
	publish(token: string | null, value: unknown): void;
}>;

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
export function loadExactRemoteModule(url: string, integrity?: string): Promise<ExactRemoteModule> {
	if (!url) return Promise.reject(new Error('Remote client entry must be a non-empty URL'));
	if (integrity !== undefined && !isValidIntegrity(integrity))
		return Promise.reject(new Error('Remote client entry has invalid integrity metadata'));
	const cacheKey = JSON.stringify([url, integrity ?? '']);
	let pending = moduleLoads.get(cacheKey);
	if (!pending) {
		pending = (
			integrity ? importIntegrityPinnedRemoteModule(url, integrity) : importExactRemoteModule(url)
		)
			.then((module) => {
				const validated = validateRemoteModule(
					integrity ? module : (module as { default: unknown }).default
				);
				// Keep successful deployments bounded. Recovery URLs deliberately
				// change across generations, so an unbounded process cache would
				// otherwise retain every deployed entry for the shell's lifetime.
				moduleLoads.delete(cacheKey);
				moduleLoads.set(cacheKey, Promise.resolve(validated));
				while (moduleLoads.size > maxModuleLoads) {
					const oldest = moduleLoads.keys().next().value;
					if (oldest === undefined || oldest === cacheKey) break;
					moduleLoads.delete(oldest);
				}
				return validated;
			})
			.catch((error) => {
				moduleLoads.delete(cacheKey);
				throw error;
			});
		moduleLoads.set(cacheKey, pending);
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
			const loaded = await loadExactRemoteModule(binding.clientEntry, binding.integrity);
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
			componentAuthorization: loaded.componentAuthorization,
			signal,
			onResponse: (metadata) => nextRecovery?.response(metadata),
			onBuildUnsupported: () => nextRecovery?.unsupported(),
			onCrossRootReplacement: () => {
				if (signal.aborted || client !== nextClient) return;
				renderDomain = createComponentDomain({ executionRoot: loaded.root });
				this.state.reconcile++;
			}
		});
		nextClient.registerComponents(loaded.registration);
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

markExactComponent(RemoteComponent, '@exactjs/microfrontends:RemoteComponent');

async function importExactRemoteModule(url: string): Promise<{ default: unknown }> {
	return import(/* @vite-ignore */ url) as Promise<{ default: unknown }>;
}

function importIntegrityPinnedRemoteModule(url: string, integrity: string): Promise<unknown> {
	return exactRemoteIntegrityLoader().load(url, integrity);
}

function exactRemoteIntegrityLoader(): ExactRemoteIntegrityLoader {
	const host = globalThis as BindingHost;
	if (host[remoteLoaderSymbol]) return host[remoteLoaderSymbol];
	let sequence = 0;
	const pending = new Map<
		string,
		Readonly<{
			resolve(value: unknown): void;
			reject(error: Error): void;
			script: HTMLScriptElement;
		}>
	>();
	const loader: ExactRemoteIntegrityLoader = Object.freeze({
		load(url, integrity) {
			if (typeof document === 'undefined')
				return Promise.reject(
					new Error('Integrity-pinned remote loading requires a browser document')
				);
			const token = `${Date.now().toString(36)}-${(++sequence).toString(36)}`;
			const source = new URL(url, document.baseURI);
			source.searchParams.set('__exact_module_token', token);
			const script = document.createElement('script');
			script.type = 'module';
			script.src = source.href;
			script.integrity = integrity;
			if (source.origin !== document.location.origin) script.crossOrigin = 'anonymous';
			return new Promise((resolve, reject) => {
				const fail = () =>
					settleRemoteLoad(
						token,
						pending,
						new Error('Remote client entry failed integrity-checked loading')
					);
				pending.set(token, { resolve, reject, script });
				script.addEventListener('error', fail, { once: true });
				script.addEventListener(
					'load',
					() => {
						if (pending.has(token)) fail();
					},
					{ once: true }
				);
				document.head.append(script);
			});
		},
		publish(token, value) {
			if (!token) return;
			const entry = pending.get(token);
			if (!entry) return;
			pending.delete(token);
			entry.script.remove();
			entry.resolve(value);
		}
	});
	host[remoteLoaderSymbol] = loader;
	return loader;
}

function settleRemoteLoad(
	token: string,
	pending: Map<string, Readonly<{ reject(error: Error): void; script: HTMLScriptElement }>>,
	error: Error
): void {
	const entry = pending.get(token);
	if (!entry) return;
	pending.delete(token);
	entry.script.remove();
	entry.reject(error);
}

function isValidIntegrity(value: string): boolean {
	const entries = value.trim().split(/\s+/);
	return (
		!!entries.length &&
		entries.every((entry) => /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(entry))
	);
}

function validateRemoteModule(value: unknown): ExactRemoteModule {
	if (!value || typeof value !== 'object') throw new Error('Invalid eXact remote module');
	const module = value as Partial<ExactRemoteModule>;
	if (
		!/^[0-9a-f]{40}$/i.test(module.buildKey ?? '') ||
		!module.root ||
		(module.componentAuthorization !== undefined &&
			(!isExactComponentAuthorizationIdentity(module.componentAuthorization) ||
				module.componentAuthorization.buildKey !== module.buildKey)) ||
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
