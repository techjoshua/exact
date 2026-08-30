import type { ContextToken } from '../component/contracts.js';
import { unwrap } from '@exactjs/reactive/framework/runtime';
import type { TaskContext } from './contracts.js';

/** Static task wiring emitted once per compiler-closed server component transition. */
export type ServerComponentTaskSlice = readonly [
	/** Authored argument positions mapped to a predecessor output port, or -1 for the authored value. */
	inputs: readonly number[],
	/** Output port and component-state path pairs published after successful work. */
	outputs: readonly (readonly [port: number, path: readonly string[]])[],
	readiness: 'blocking' | 'nonblocking',
	label: string
];

/** Request-local ownership used by a compiler-closed scheduled server component. */
export type ServerComponentExecutionFrame = AsyncDisposable &
	Readonly<{
		run<T>(work: () => T): T;
	}>;

type ServerExecutionOptions = Readonly<{
	observe(settlement: Promise<unknown>): void;
	runTask?<T>(work: () => Promise<T>): Promise<T>;
}>;

type OutputSlot = {
	status: 'pending' | 'available' | 'failed';
	value?: unknown;
	error?: unknown;
	waiters?: Set<{ resolve(value: unknown): void; reject(error: unknown): void }>;
	subscribers?: Set<() => void>;
};

type MutableServerExecutionFrame = {
	host: { readonly contexts?: Map<symbol, unknown>; readonly state?: object };
	options: ServerExecutionOptions;
	controller: AbortController;
	ports: OutputSlot[];
	paths: Array<readonly [path: string, port: number]>;
	active: Promise<unknown>[];
	continuationContexts: Map<string, ContextToken<unknown>>;
	settledContinuations: Set<string>;
	disposed: boolean;
};

type ServerExecutionHost = {
	readonly contexts?: Map<symbol, unknown>;
	readonly state?: object;
} & {
	[serverExecutionFrame]?: MutableServerExecutionFrame;
};

/**
 * Realm-stable protocol identities shared by separately evaluated copies of the core package.
 * The frame remains owned by its request-local host and is removed when that request is disposed;
 * dependency tokens carry only request-owned output slots.
 */
const serverExecutionFrame = Symbol.for('@exactjs/server-component-execution-frame');
const serverDependencyBrand = Symbol.for('@exactjs/server-component-dependency');

type ServerComponentDependency = Readonly<{
	[serverDependencyBrand]: OutputSlot;
}>;

type ServerComponentIssuer = (component: unknown) => void;

let activeComponentIssuer: ServerComponentIssuer | undefined;

/**
 * Installs the request renderer's synchronous child-issuance callback while compiled render code
 * materializes its compiler-issued child operations. JavaScript cannot interleave another request during this synchronous
 * extent, and nested renderers restore the preceding issuer in stack order.
 */
export function withServerComponentIssuer<T>(issuer: ServerComponentIssuer, render: () => T): T {
	const previous = activeComponentIssuer;
	activeComponentIssuer = issuer;
	try {
		return render();
	} finally {
		activeComponentIssuer = previous;
	}
}

/**
 * Returns a compiler-created component receipt after issuing its request-local server work. Outside
 * SSR this is deliberately a zero-allocation pass-through.
 */
export function issueServerComponentReceipt<T>(component: T): T {
	activeComponentIssuer?.(component);
	return component;
}

/** Returns the request-local output source carried by a compiler-forwarded server value. */
export function serverComponentDependencyForValue(value: unknown) {
	const slot = serverDependencySlot(value);
	if (!slot) return undefined;
	return {
		read() {
			switch (slot.status) {
				case 'available':
					return { status: 'available' as const, generation: 1, version: 1, value: slot.value };
				case 'failed':
					return { status: 'failed' as const, generation: 1, version: 1, error: slot.error };
				default:
					return { status: 'pending' as const, generation: 1, version: 0 };
			}
		},
		subscribe(notify: () => void): Disposable {
			const subscribers = (slot.subscribers ??= new Set());
			subscribers.add(notify);
			return { [Symbol.dispose]: () => subscribers.delete(notify) };
		}
	};
}

function serverDependencySlot(value: unknown): OutputSlot | undefined {
	return value && typeof value === 'object' && serverDependencyBrand in value
		? (value as ServerComponentDependency)[serverDependencyBrand]
		: undefined;
}

/** Forwards a compiler-known component output without constructing generic dependency provenance. */
export function serverComponentExecutionValueForHost<T>(
	host: object,
	path: string | readonly string[],
	compute: () => T
): T | ServerComponentDependency;
export function serverComponentExecutionValueForHost<T>(
	host: object,
	path: string | readonly string[],
	value: T
): T | ServerComponentDependency;
export function serverComponentExecutionValueForHost<T>(
	host: object,
	path: string | readonly string[],
	value: T | (() => T)
): T | ServerComponentDependency {
	const frame = executionFrameForHost(host);
	if (!frame) return resolveServerExecutionValue(value);
	const paths = typeof path === 'string' ? [path] : path;
	const sources: OutputSlot[] = [];
	for (const candidate of paths) {
		const normalized = candidate.replace(/^this\.state\./, '');
		for (const [registered, port] of frame.paths)
			if (registered === normalized) {
				const source = outputSlot(frame, port);
				if (!sources.includes(source)) sources.push(source);
			}
	}
	if (!sources.length) return resolveServerExecutionValue(value);
	return Object.freeze({
		[serverDependencyBrand]:
			typeof path === 'string' && typeof value !== 'function'
				? sources[0]!
				: projectServerExecutionValue(sources, value)
	});
}

/** Projects an aggregate expression only after every compiler-selected output path settles. */
function projectServerExecutionValue<T>(sources: readonly OutputSlot[], value: T): OutputSlot {
	const projected: OutputSlot = { status: 'pending' };
	const refresh = (): void => {
		let unavailable: OutputSlot | undefined;
		for (const source of sources) {
			if (source.status === 'failed') {
				unavailable = source;
				break;
			}
			if (source.status === 'pending') unavailable ??= source;
		}
		if (unavailable?.status === 'failed') {
			projected.status = 'failed';
			projected.error = unavailable.error;
			delete projected.value;
		} else if (unavailable) {
			projected.status = 'pending';
			delete projected.value;
			delete projected.error;
		} else {
			projected.status = 'available';
			projected.value = resolveServerExecutionValue(value);
			delete projected.error;
		}
		for (const subscriber of projected.subscribers ?? []) subscriber();
	};
	for (const source of sources) (source.subscribers ??= new Set()).add(refresh);
	refresh();
	return projected;
}

function resolveServerExecutionValue<T>(value: T | (() => T)): T {
	return (typeof value === 'function' ? (value as () => T)() : unwrap(value)) as T;
}

/**
 * Creates only the cancellation and port storage required by compiler-emitted task slices. It does
 * not construct a task owner, prepare a component graph, subscribe reactive watchers, or allocate
 * universal task lanes.
 */
export function createServerComponentExecutionFrame(
	host: ServerExecutionHost,
	options: ServerExecutionOptions
): ServerComponentExecutionFrame {
	const frame: MutableServerExecutionFrame = {
		host,
		options,
		controller: new AbortController(),
		ports: [],
		paths: [],
		active: [],
		continuationContexts: new Map(),
		settledContinuations: new Set(),
		disposed: false
	};
	Object.defineProperty(host, serverExecutionFrame, {
		configurable: true,
		value: frame
	});
	return Object.freeze({
		run<T>(work: () => T): T {
			if (frame.disposed) throw new Error('Server component execution frame has been disposed');
			return work();
		},
		async [Symbol.asyncDispose]() {
			if (frame.disposed) return;
			frame.disposed = true;
			const reason = new DOMException('Server component execution disposed', 'AbortError');
			frame.controller.abort(reason);
			for (let port = 0; port < frame.ports.length; port++)
				if (frame.ports[port]?.status === 'pending') failPort(frame, port, reason);
			await Promise.allSettled(frame.active);
			// A stale disposer must not detach a newer frame installed on the same request host.
			if (host[serverExecutionFrame] === frame) delete host[serverExecutionFrame];
			frame.ports.length = 0;
			frame.paths.length = 0;
			frame.active.length = 0;
			frame.continuationContexts.clear();
			frame.settledContinuations.clear();
		}
	});
}

/** Activates one compiler-wired setup transition without materializing the universal task ABI. */
export function activateServerComponentTaskForHost<Args extends unknown[], Result>(
	host: object,
	slice: ServerComponentTaskSlice,
	transitionId: string,
	work: (...args: [...Args, TaskContext]) => Result | PromiseLike<Result>,
	...authored: Args
): void {
	const frame = executionFrameForHost(host);
	if (!frame || frame.disposed)
		throw new Error('Compiled server task requires an active server component execution frame');
	for (const [port, path] of slice[1]) {
		outputSlot(frame, port);
		registerOutputPath(frame, path.join('.'), port);
	}
	const settlement = executeSlice(frame, slice, work, authored).then((result) => {
		frame.settledContinuations.add(transitionId);
		return result;
	});
	frame.active.push(settlement);
	void settlement.catch(() => undefined);
	if (slice[2] === 'blocking') frame.options.observe(settlement);
}

/** Registers compiler-approved public context names against one request-local server frame. */
export function registerServerComponentContinuationContextsForHost(
	host: object,
	bindings: readonly Readonly<{ name: string; token: ContextToken<unknown> }>[]
): void {
	const frame = executionFrameForHost(host);
	if (!frame || frame.disposed)
		throw new Error('Compiled server context registration requires an active execution frame');
	for (const binding of bindings) {
		if (!safeContextName(binding.name) || typeof binding.token?.id !== 'symbol')
			throw new Error('Malformed eXact server continuation context binding');
		const previous = frame.continuationContexts.get(binding.name);
		if (previous && previous.id !== binding.token.id)
			throw new Error(`Conflicting eXact server continuation context binding ${binding.name}`);
		frame.continuationContexts.set(binding.name, binding.token);
	}
}

/** Projects compiler-selected shared context values from one direct request-local frame. */
export function serverComponentContinuationContextValuesForHost(
	host: object,
	names: readonly string[]
): Record<string, unknown> {
	if (names.length === 0) return {};
	const frame = executionFrameForHost(host);
	if (!frame || frame.disposed)
		throw new Error('Compiled server context publication requires an active execution frame');
	const values: Record<string, unknown> = {};
	for (const name of names) {
		const token = frame.continuationContexts.get(name);
		if (!token) throw new Error(`Missing eXact server continuation context binding ${name}`);
		if (!frame.host.contexts?.has(token.id)) continue;
		const value = frame.host.contexts.get(token.id);
		if (value !== undefined) values[name] = value;
	}
	return values;
}

/** Lists direct server continuation generations that settled successfully in this request. */
export function settledServerComponentContinuationIdsForHost(host: object): readonly string[] {
	const frame = executionFrameForHost(host);
	return frame && !frame.disposed ? [...frame.settledContinuations] : [];
}

function safeContextName(name: string): boolean {
	return name.length > 0 && name !== '__proto__' && name !== 'prototype' && name !== 'constructor';
}

/** Reads the request-owned frame without retaining the host outside its request lifetime. */
function executionFrameForHost(host: object): MutableServerExecutionFrame | undefined {
	return (host as ServerExecutionHost)[serverExecutionFrame];
}

function executeSlice<Args extends unknown[], Result>(
	frame: MutableServerExecutionFrame,
	slice: ServerComponentTaskSlice,
	work: (...args: [...Args, TaskContext]) => Result | PromiseLike<Result>,
	authored: Args
): Promise<Result> {
	const inputs = authored.slice() as Args;
	const pending: Promise<void>[] = [];
	for (let index = 0; index < inputs.length; index++) {
		const port = slice[0][index] ?? -1;
		const slot = port < 0 ? serverDependencySlot(inputs[index]) : outputSlot(frame, port);
		if (!slot) continue;
		if (slot.status === 'available') inputs[index] = slot.value as Args[number];
		else if (slot.status === 'failed') return Promise.reject(slot.error);
		else
			pending.push(
				waitForSlot(slot).then((value) => {
					inputs[index] = value as Args[number];
				})
			);
	}
	return pending.length
		? Promise.all(pending).then(() => invokeSlice(frame, slice, work, inputs))
		: invokeSlice(frame, slice, work, inputs);
}

async function invokeSlice<Args extends unknown[], Result>(
	frame: MutableServerExecutionFrame,
	slice: ServerComponentTaskSlice,
	work: (...args: [...Args, TaskContext]) => Result | PromiseLike<Result>,
	inputs: Args
): Promise<Result> {
	if (frame.controller.signal.aborted) throw frame.controller.signal.reason;
	const cleanups: (() => void | Promise<void>)[] = [];
	const context: TaskContext = {
		signal: frame.controller.signal,
		generation: 1,
		activation: 'initialization',
		peek: (read) => read(),
		optimistic: (update) => update(),
		cleanup(cleanup) {
			cleanups.push(cleanup);
		},
		own<T extends Disposable | AsyncDisposable>(resource: T): T {
			cleanups.push(() => {
				if (Symbol.asyncDispose in resource)
					return Promise.resolve(resource[Symbol.asyncDispose]());
				resource[Symbol.dispose]();
			});
			return resource;
		}
	};
	let result!: Result;
	let failure: unknown;
	try {
		const invoke = async () => Promise.resolve(work(...inputs, context));
		result = frame.options.runTask ? await frame.options.runTask(invoke) : await invoke();
		for (const [port, path] of slice[1]) publishPort(frame, port, readPath(frame.host.state, path));
	} catch (error) {
		failure = error;
		for (const [port] of slice[1]) failPort(frame, port, error);
	} finally {
		for (let index = cleanups.length - 1; index >= 0; index--) {
			try {
				await cleanups[index]!();
			} catch (cleanupError) {
				if (failure && typeof failure === 'object')
					Object.defineProperty(failure, 'suppressed', {
						configurable: true,
						value: cleanupError
					});
				else failure = cleanupError;
			}
		}
	}
	if (failure !== undefined) throw failure;
	return result;
}

function outputSlot(frame: MutableServerExecutionFrame, port: number): OutputSlot {
	let slot = frame.ports[port];
	if (!slot) {
		slot = { status: 'pending' };
		frame.ports[port] = slot;
	}
	return slot;
}

function registerOutputPath(frame: MutableServerExecutionFrame, path: string, port: number): void {
	for (let index = 0; index < frame.paths.length; index++) {
		if (frame.paths[index]![0] !== path) continue;
		frame.paths[index] = [path, port];
		return;
	}
	frame.paths.push([path, port]);
}

function waitForSlot(slot: OutputSlot): Promise<unknown> {
	if (slot.status === 'available') return Promise.resolve(slot.value);
	if (slot.status === 'failed') return Promise.reject(slot.error);
	return new Promise((resolve, reject) => (slot.waiters ??= new Set()).add({ resolve, reject }));
}

function publishPort(frame: MutableServerExecutionFrame, port: number, value: unknown): void {
	const slot = outputSlot(frame, port);
	slot.status = 'available';
	slot.value = value;
	for (const waiter of slot.waiters ?? []) waiter.resolve(value);
	slot.waiters?.clear();
	for (const subscriber of slot.subscribers ?? []) subscriber();
}

function failPort(frame: MutableServerExecutionFrame, port: number, error: unknown): void {
	const slot = outputSlot(frame, port);
	slot.status = 'failed';
	slot.error = error;
	for (const waiter of slot.waiters ?? []) waiter.reject(error);
	slot.waiters?.clear();
	for (const subscriber of slot.subscribers ?? []) subscriber();
}

function readPath(source: unknown, path: readonly string[]): unknown {
	let value = source;
	for (const segment of path) {
		if (!value || typeof value !== 'object') return undefined;
		value = (value as Record<string, unknown>)[segment];
	}
	return value;
}
