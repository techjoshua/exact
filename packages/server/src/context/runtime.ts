import {
	RequestContext,
	createRequestContextValue,
	type RequestContextValue,
	type RequestResponseState
} from '@exact/request';
import type {
	ExactContextFactoryContext,
	ExactContextRuntime,
	ExactContextScope,
	ExactRequestLike,
	ExactServerContextConfiguration
} from '../types.js';
import { createRequestLifetime } from './request.js';
import { abortReason, applyOverrides, awaitWithAbort, headerValue } from './response.js';
import { ContextScope } from './scope.js';

export class ContextRuntime implements ExactContextRuntime {
	private readonly applicationAbort = new AbortController();
	private readonly activeRequests = new Set<(reason?: unknown) => Promise<void>>();
	private application?: ContextScope;
	private initializing?: Promise<ContextScope>;
	private disposed = false;

	constructor(private readonly configuration: ExactServerContextConfiguration) {}

	async open(
		request: ExactRequestLike,
		platformRequest: unknown = request
	): Promise<{
		context: ExactContextScope;
		request: RequestContextValue;
		response: RequestResponseState;
		dispose(reason?: unknown): Promise<void>;
	}> {
		if (this.disposed) throw new Error('Cannot open a request on a disposed eXact context runtime');
		const application = await this.applicationScope();
		const lifetime = createRequestLifetime(request.signal, this.applicationAbort.signal);
		const response: RequestResponseState = { headers: new Headers(), committed: false };
		const requestValue = createRequestContextValue(
			{
				url: request.url,
				method: request.method,
				headers: request.headers,
				signal: lifetime.signal,
				locale: headerValue(request.headers, 'accept-language')?.split(',')[0]?.trim(),
				traceId:
					headerValue(request.headers, 'traceparent') ??
					headerValue(request.headers, 'x-request-id')
			},
			response
		);
		const sourceContext: ExactContextFactoryContext = {
			scope: 'request',
			signal: requestValue.signal,
			request: requestValue,
			platformRequest,
			get: (token) => application.get(token)
		};
		let scope: ContextScope | undefined;
		try {
			const configured =
				typeof this.configuration.requestContexts === 'function'
					? await awaitWithAbort(
							Promise.resolve(this.configuration.requestContexts(sourceContext)),
							requestValue.signal
						)
					: (this.configuration.requestContexts ?? []);
			const overrides = this.configuration.contextOverrides?.request ?? [];
			const registrations = applyOverrides(configured, overrides, 'request');
			scope = new ContextScope(
				'request',
				registrations,
				requestValue.signal,
				application,
				[[RequestContext, requestValue]],
				requestValue,
				platformRequest
			);
			await scope.initialize();
			if (requestValue.signal.aborted) {
				await scope.dispose(requestValue.signal.reason);
				throw abortReason(requestValue.signal);
			}
		} catch (error) {
			lifetime.abort(error);
			lifetime.dispose();
			throw error;
		}
		let closing: Promise<void> | undefined;
		const close = (reason: unknown = 'eXact request complete'): Promise<void> => {
			if (closing) return closing;
			closing = (async () => {
				this.activeRequests.delete(closeWithListener);
				lifetime.abort(reason);
				try {
					await scope.dispose(reason);
				} finally {
					lifetime.dispose();
				}
			})();
			return closing;
		};
		const abort = () => {
			void close(requestValue.signal.reason).catch(() => undefined);
		};
		requestValue.signal.addEventListener('abort', abort, { once: true });
		const closeWithListener = async (reason?: unknown) => {
			requestValue.signal.removeEventListener('abort', abort);
			await close(reason);
		};
		this.activeRequests.add(closeWithListener);
		return {
			context: scope,
			request: requestValue,
			response,
			dispose: closeWithListener
		};
	}

	async dispose(reason = 'eXact server runtime disposed'): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		const activeRequests = [...this.activeRequests];
		this.applicationAbort.abort(reason);
		const requestResults = await Promise.allSettled(
			activeRequests.map((dispose) => dispose(reason))
		);
		const application = this.application ?? (await this.initializing?.catch(() => undefined));
		let applicationFailure: unknown;
		try {
			await application?.dispose(reason);
		} catch (error) {
			applicationFailure = error;
		}
		this.application = undefined;
		const failures = requestResults
			.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
			.map((result) => result.reason);
		if (applicationFailure !== undefined) failures.push(applicationFailure);
		if (failures.length === 1) throw failures[0];
		if (failures.length > 1)
			throw new AggregateError(failures, 'Failed to dispose eXact server contexts');
	}

	private async applicationScope(): Promise<ContextScope> {
		if (this.application) return this.application;
		if (this.initializing) return this.initializing;
		this.initializing = this.createApplicationScope();
		try {
			this.application = await this.initializing;
			return this.application;
		} finally {
			this.initializing = undefined;
		}
	}

	private async createApplicationScope(): Promise<ContextScope> {
		const configured = this.configuration.applicationContexts ?? [];
		const overrides = this.configuration.contextOverrides?.application ?? [];
		const scope = new ContextScope(
			'application',
			applyOverrides(configured, overrides, 'application'),
			this.applicationAbort.signal
		);
		await scope.initialize();
		return scope;
	}
}
