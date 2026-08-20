import {
	attachSuppressedCleanupFailure,
	type AnyContextToken,
	type ComponentContextValues,
	type ContextToken
} from '@exactjs/core';
import { type RequestContextValue } from '@exactjs/request';
import type {
	AnyExactContextFactory,
	AnyExactContextRegistration,
	ExactContextFactoryContext,
	ExactContextRegistration,
	ExactContextScope
} from '../types.js';
import { abortReason, awaitWithAbort, disposeOwnedValue, isFactory } from './response.js';

/** Defines the scope kind type contract. */
export type ScopeKind = 'application' | 'request';

/** Defines the owned value type contract. */
export type OwnedValue = {
	token: AnyContextToken;
	value: unknown;
	factory: AnyExactContextFactory;
};

/** Defines the context scope class contract. */
export class ContextScope implements ExactContextScope {
	readonly values = new Map<symbol, unknown>();
	readonly componentValues: ComponentContextValues;
	private readonly providers = new Map<symbol, AnyExactContextRegistration>();
	private readonly providerOrder: symbol[] = [];
	private readonly owned = new Map<symbol, OwnedValue>();
	private readonly dependencies = new Map<symbol, Set<symbol>>();
	private readonly inFlight = new Map<symbol, Promise<unknown>>();
	private disposed = false;

	constructor(
		readonly kind: ScopeKind,
		registrations: readonly AnyExactContextRegistration[],
		private readonly signal: AbortSignal,
		private readonly parent?: ContextScope,
		initialValues: readonly (readonly [AnyContextToken, unknown])[] = [],
		private readonly request?: RequestContextValue,
		private readonly platformRequest?: unknown
	) {
		for (const [token, value] of initialValues) this.values.set(token.id, value);
		for (const registration of registrations) {
			const [token] = registration;
			if (token.scope !== kind) {
				throw new Error(
					`Context "${token.description}" declares ${token.scope} scope and cannot be registered as ${kind}-scoped`
				);
			}
			if (this.providers.has(token.id) || this.values.has(token.id)) {
				throw new Error(
					`Context "${token.description}" is registered more than once in ${kind} scope`
				);
			}
			this.providers.set(token.id, registration);
			this.providerOrder.push(token.id);
		}
		const inherited = parent ? parent.componentValues : undefined;
		const componentValues = new Map(inherited);
		for (const [token, value] of initialValues) componentValues.set(token.id, value);
		this.componentValues = componentValues;
	}

	/** Performs the initialize domain operation for this context scope instance. */
	async initialize(): Promise<void> {
		try {
			for (const [token] of this.providers.values()) await this.resolve(token);
		} catch (error) {
			try {
				await this.dispose(error);
			} catch (cleanup) {
				attachSuppressedCleanupFailure(error, cleanup);
			}
			throw error;
		}
	}

	/** Resolves a get for this context scope instance. */
	async get<T>(token: ContextToken<T>): Promise<T> {
		return this.resolve(token);
	}

	/** Resolves a sync for this context scope instance. */
	getSync<T>(token: ContextToken<T>): T {
		if (this.values.has(token.id)) return this.values.get(token.id) as T;
		if (this.parent) return this.parent.getSync(token);
		throw new Error(`Context "${token.description}" has not been initialized in this server scope`);
	}

	/** Replaces a value in the scope which owns the token's residency. */
	setSync<T>(token: ContextToken<T>, value: T): void {
		if (this.disposed) throw new Error(`Cannot write disposed ${this.kind} context scope`);
		if (token.scope !== 'component' && token.scope !== this.kind && this.parent) {
			this.parent.setSync(token, value);
			return;
		}
		if (token.scope !== this.kind && token.scope !== 'component') {
			throw new Error(
				`Context "${token.description}" cannot be written through a ${this.kind} scope`
			);
		}
		this.values.set(token.id, value);
		(this.componentValues as Map<symbol, unknown>).set(token.id, value);
	}

	/** Releases resources owned by this context scope instance. */
	async dispose(reason?: unknown): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		const failures: unknown[] = [];
		for (const owned of this.disposalOrder()) {
			try {
				await disposeOwnedValue(owned, reason);
			} catch (error) {
				failures.push(error);
			}
		}
		this.owned.clear();
		this.values.clear();
		if (failures.length === 1) throw failures[0];
		if (failures.length > 1)
			throw new AggregateError(failures, `Failed to dispose ${this.kind} contexts`);
	}

	private async resolve<T>(
		token: ContextToken<T>,
		path: readonly AnyContextToken[] = []
	): Promise<T> {
		if (this.disposed) throw new Error(`Cannot read disposed ${this.kind} context scope`);
		if (this.values.has(token.id)) return this.values.get(token.id) as T;
		const cycleStart = path.findIndex((item) => item.id === token.id);
		if (cycleStart >= 0) {
			const cycle = [...path.slice(cycleStart), token].map((item) => item.description).join(' -> ');
			throw new Error(`Server context dependency cycle: ${cycle}`);
		}
		const pending = this.inFlight.get(token.id);
		if (pending) return pending as Promise<T>;
		const registration = this.providers.get(token.id);
		if (!registration) {
			if (this.parent) return this.parent.resolve(token, path);
			throw new Error(`Context "${token.description}" is not registered in the server scope`);
		}

		const resolution = this.resolveRegistration(token, registration, path);
		this.inFlight.set(token.id, resolution);
		try {
			return await resolution;
		} finally {
			this.inFlight.delete(token.id);
		}
	}

	private async resolveRegistration<T>(
		token: ContextToken<T>,
		registration: ExactContextRegistration<T>,
		path: readonly AnyContextToken[]
	): Promise<T> {
		const source = registration[1];
		let value: T;
		if (isFactory(source)) {
			const dependencies = this.dependencies.get(token.id) ?? new Set<symbol>();
			this.dependencies.set(token.id, dependencies);
			const context: ExactContextFactoryContext = {
				scope: this.kind,
				signal: this.signal,
				request: this.request,
				platformRequest: this.platformRequest,
				get: (dependency) => {
					dependencies.add(dependency.id);
					return this.resolve(dependency, [...path, token]);
				}
			};
			const creation = Promise.resolve().then(() => source.create(context));
			try {
				value = await awaitWithAbort(creation, this.signal);
			} catch (error) {
				if (this.signal.aborted) {
					void creation
						.then(
							(lateValue) =>
								disposeOwnedValue({ token, value: lateValue, factory: source }, this.signal.reason),
							() => undefined
						)
						.catch(() => undefined);
				}
				throw error;
			}
			if (this.signal.aborted) {
				await disposeOwnedValue({ token, value, factory: source }, this.signal.reason);
				throw abortReason(this.signal);
			}
			this.owned.set(token.id, { token, value, factory: source });
		} else {
			value = source.value;
		}
		this.values.set(token.id, value);
		(this.componentValues as Map<symbol, unknown>).set(token.id, value);
		return value;
	}

	private disposalOrder(): OwnedValue[] {
		const initialized = new Set(this.owned.keys());
		const visited = new Set<symbol>();
		const creationOrder: symbol[] = [];
		const visit = (id: symbol) => {
			if (visited.has(id) || !initialized.has(id)) return;
			visited.add(id);
			for (const dependency of this.dependencies.get(id) ?? []) visit(dependency);
			creationOrder.push(id);
		};
		for (const id of this.providerOrder) visit(id);
		return creationOrder.reverse().map((id) => this.owned.get(id)!);
	}
}
