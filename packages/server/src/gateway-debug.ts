import type { ExactDebugRequest } from '@exactjs/devtools-protocol';
import type { ExactResponseLike } from './types.js';

/** Resolves the build/root pair required for a routed debug request. */
export function debugRoute(
	input: ExactDebugRequest
): Readonly<{ buildKey: string; executionRoot: string }> | undefined {
	if (input.request === 'query') {
		const identity = input.query.params?.identity;
		return identity
			? { buildKey: identity.buildKey, executionRoot: identity.executionRoot }
			: undefined;
	}
	if (input.request === 'subscribe') {
		const buildKey = input.filter?.buildKey;
		const executionRoot = input.filter?.executionRoot;
		return buildKey && executionRoot ? { buildKey, executionRoot } : undefined;
	}
	return undefined;
}

/** Rewrites child debug identities into the page-host session and binding namespace. */
export function translateDebugResponse(
	response: ExactResponseLike,
	childSessionId: string,
	parentSessionId: string,
	binding: string,
	buildKey: string
): ExactResponseLike {
	if (response.stream)
		return {
			...response,
			stream: translateDebugStream(
				response.stream,
				childSessionId,
				parentSessionId,
				binding,
				buildKey
			)
		};
	try {
		const parsed = JSON.parse(response.body);
		return {
			...response,
			body: JSON.stringify(
				translateDebugValue(parsed, childSessionId, parentSessionId, binding, buildKey)
			)
		};
	} catch {
		return response;
	}
}

/** Rebinds a page-session debug request to one remote child session. */
export function remoteDebugRequest(
	input: Exclude<ExactDebugRequest, { request: 'open' | 'close' }>,
	childSessionId: string
): ExactDebugRequest {
	if (input.request === 'subscribe') {
		const { binding: _binding, ...filter } = input.filter ?? {};
		return Object.freeze({
			...input,
			sessionId: childSessionId,
			...(input.filter ? { filter: Object.freeze(filter) } : {})
		});
	}
	const identity = input.query.params?.identity;
	const remoteIdentity = identity
		? Object.freeze({
				...identity,
				sessionId: childSessionId,
				...(identity.binding ? { binding: undefined } : {})
			})
		: undefined;
	return Object.freeze({
		...input,
		sessionId: childSessionId,
		query: Object.freeze({
			...input.query,
			...(input.query.params
				? {
						params: Object.freeze({
							...input.query.params,
							...(remoteIdentity ? { identity: remoteIdentity } : {}),
							...(input.query.params.filter
								? {
										filter: Object.freeze(
											Object.fromEntries(
												Object.entries(input.query.params.filter).filter(
													([key]) => key !== 'binding'
												)
											)
										)
									}
								: {})
						})
					}
				: {})
		})
	});
}

function translateDebugStream(
	source: ReadableStream<Uint8Array>,
	childSessionId: string,
	parentSessionId: string,
	binding: string,
	buildKey: string
): ReadableStream<Uint8Array> {
	const reader = source.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buffered = '';
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			const next = await reader.read();
			if (next.done) {
				if (buffered.trim()) controller.enqueue(encoder.encode(translateLine(buffered)));
				controller.close();
				reader.releaseLock();
				return;
			}
			buffered += decoder.decode(next.value, { stream: true });
			let newline: number;
			while ((newline = buffered.indexOf('\n')) >= 0) {
				const line = buffered.slice(0, newline);
				buffered = buffered.slice(newline + 1);
				controller.enqueue(encoder.encode(`${translateLine(line)}\n`));
			}
		},
		async cancel(reason) {
			await reader.cancel(reason);
		}
	});

	function translateLine(line: string): string {
		if (!line.trim()) return line;
		return JSON.stringify(
			translateDebugValue(JSON.parse(line), childSessionId, parentSessionId, binding, buildKey)
		);
	}
}

function translateDebugValue(
	value: unknown,
	child: string,
	parent: string,
	binding: string,
	buildKey: string
): unknown {
	if (value === child) return parent;
	if (Array.isArray(value))
		return value.map((entry) => translateDebugValue(entry, child, parent, binding, buildKey));
	if (!value || typeof value !== 'object') return value;
	const translated = Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [
			key,
			translateDebugValue(entry, child, parent, binding, buildKey)
		])
	);
	if (
		translated.sessionId === parent &&
		(translated.buildKey === buildKey || translated.side === 'server')
	)
		translated.binding = binding;
	return translated;
}
