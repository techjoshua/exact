import {
	createComponentDomain,
	createRef,
	watch,
	type Child,
	type Component,
	type ComponentDomain
} from '@exactjs/core';
import { createExactClient, type ExactClient } from '@exactjs/hydrate';
import { createExactRoot } from '@exactjs/hydrate/internal';
import { createCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-abi';
import type { ExactRemoteModule } from './artifacts.js';
import { loadExactRemoteModule } from './module-loading.js';
export { loadExactRemoteModule } from './module-loading.js';
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

/** Mounts one client-loaded exposure as an ordinary logical eXact child. */
export function RemoteComponent(
	this: Component<{
		phase: 'placeholder' | 'ready' | 'failed';
		generation: number;
		reconcile: number;
	}>,
	props: RemoteComponentProps
): () => Child {
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
			const loaded = await loadExactRemoteModule(binding.clientEntry, binding.integrity, signal);
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

	return () =>
		// These reads keep module-generation and cross-root reconciliation changes observable
		// even when the public phase does not change.
		(
			void this.state.generation,
			void this.state.reconcile,
			createCompiledIntrinsicReceipt(
				'div',
				{
					ref: this.ref(containerRef),
					'data-exact-remote': props.binding,
					'data-exact-remote-state': this.state.phase
				},
				...(this.state.phase === 'ready' && remote && client
					? [
							createExactRoot(
								client,
								remote.component as import('@exactjs/core').AnyStateComponentFunction<
									Record<string, unknown>
								>,
								props.props,
								props.children,
								renderDomain
							)
						]
					: this.state.phase === 'failed'
						? normalizeFallback(props.fallback)
						: [])
			)
		);
}

function normalizeFallback(value: Child | Child[] | undefined): Child[] {
	return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
