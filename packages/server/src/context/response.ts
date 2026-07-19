import { attachSuppressedCleanupFailure, type ContextToken } from '@exact/core';
import { commitRequestResponseState, type RequestResponseState } from '@exact/request';
import type { ExactContextFactory, ExactRequestLike, ExactResponseLike } from '../types.js';
import { type AnyRegistration, type OwnedValue, type ScopeKind } from './scope.js';

export function applyResponseState(response: ExactResponseLike, state: RequestResponseState): void {
	const committed = commitRequestResponseState(state);
	if (committed.status !== undefined) response.status = committed.status;
	committed.headers.forEach((value, name) => {
		response.headers[name] = value;
	});
}

export function applyOverrides(
	registrations: readonly AnyRegistration[],
	overrides: readonly (readonly [ContextToken<any>, unknown])[],
	scope: ScopeKind
): AnyRegistration[] {
	const result = new Map<symbol, AnyRegistration>();
	for (const registration of registrations) {
		const token = registration[0];
		if (result.has(token.id)) {
			throw new Error(
				`Context "${token.description}" is registered more than once in ${scope} scope`
			);
		}
		result.set(token.id, registration);
	}
	for (const [token, value] of overrides) {
		if (token.scope !== scope) {
			throw new Error(
				`Test override for "${token.description}" declares ${token.scope} scope, expected ${scope}`
			);
		}
		result.set(token.id, [token, { value }]);
	}
	return [...result.values()];
}

export function isFactory<T>(
	value: { value: T } | ExactContextFactory<T>
): value is ExactContextFactory<T> {
	return (
		!!value &&
		typeof value === 'object' &&
		typeof (value as ExactContextFactory<T>).create === 'function'
	);
}

export async function disposeOwnedValue(owned: OwnedValue, reason: unknown): Promise<void> {
	if (owned.factory.dispose) {
		await owned.factory.dispose(owned.value, reason);
		return;
	}
	const value = owned.value as any;
	const asyncDispose = (Symbol as any).asyncDispose;
	const dispose = (Symbol as any).dispose;
	if (asyncDispose && typeof value?.[asyncDispose] === 'function') {
		await value[asyncDispose]();
	} else if (dispose && typeof value?.[dispose] === 'function') {
		value[dispose]();
	}
}

export function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) return Promise.reject(abortReason(signal));
	return new Promise<T>((resolve, reject) => {
		let settled = false;
		const abort = () => {
			if (settled) return;
			settled = true;
			reject(abortReason(signal));
		};
		signal.addEventListener('abort', abort, { once: true });
		promise.then(
			(value) => {
				if (settled) {
					// The owning scope observes the aborted signal after factory completion
					// and disposes late-created resources before rejecting.
					return;
				}
				settled = true;
				signal.removeEventListener('abort', abort);
				resolve(value);
			},
			(error) => {
				if (settled) return;
				settled = true;
				signal.removeEventListener('abort', abort);
				reject(error);
			}
		);
	});
}

export function abortReason(signal: AbortSignal): unknown {
	return signal.reason ?? new DOMException('eXact request aborted', 'AbortError');
}

export function headerValue(
	headers: ExactRequestLike['headers'],
	name: string
): string | undefined {
	if (!headers) return undefined;
	if (headers instanceof Headers) return headers.get(name) ?? undefined;
	const expected = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() !== expected || value === undefined) continue;
		return Array.isArray(value) ? value.join(',') : value;
	}
	return undefined;
}

export function isResponse(value: unknown): value is ExactResponseLike {
	return (
		!!value &&
		typeof value === 'object' &&
		typeof (value as ExactResponseLike).status === 'number' &&
		typeof (value as ExactResponseLike).headers === 'object' &&
		typeof (value as ExactResponseLike).body === 'string'
	);
}

export function retainScopeForStream(
	stream: ReadableStream<Uint8Array>,
	dispose: (reason?: unknown) => Promise<void>,
	signal?: AbortSignal
): ReadableStream<Uint8Array> {
	const reader = stream.getReader();
	let finished = false;
	let abort: (() => void) | undefined;
	const finish = async (reason: unknown) => {
		if (finished) return;
		finished = true;
		if (abort) signal?.removeEventListener('abort', abort);
		try {
			reader.releaseLock();
		} finally {
			await dispose(reason);
		}
	};
	return new ReadableStream<Uint8Array>(
		{
			start(controller) {
				abort = () => {
					const reason =
						signal?.reason ?? new DOMException('eXact response stream aborted', 'AbortError');
					controller.error(reason);
					void reader
						.cancel(reason)
						.then(() => finish(reason))
						.catch((cleanup) => attachSuppressedCleanupFailure(reason, cleanup));
				};
				if (signal?.aborted) abort();
				else signal?.addEventListener('abort', abort, { once: true });
			},
			async pull(controller) {
				try {
					const next = await reader.read();
					if (next.done) {
						await finish('eXact response stream complete');
						controller.close();
					} else {
						controller.enqueue(next.value);
					}
				} catch (error) {
					await disposePreservingPrimary(finish, error);
					controller.error(error);
				}
			},
			async cancel(reason) {
				let primary: unknown;
				try {
					await reader.cancel(reason);
				} catch (error) {
					primary = error;
				}
				if (primary !== undefined) {
					await disposePreservingPrimary(finish, primary);
					throw primary;
				}
				await finish(reason);
			}
		},
		{ highWaterMark: 0 }
	);
}

export async function disposePreservingPrimary(
	dispose: (reason?: unknown) => Promise<void>,
	primary: unknown
): Promise<void> {
	try {
		await dispose(primary);
	} catch (cleanup) {
		attachSuppressedCleanupFailure(primary, cleanup);
	}
}
