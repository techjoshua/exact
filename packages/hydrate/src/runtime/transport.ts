import type { ExactClient, ExactInvocationKind, FetchLike, HydrateOptions } from '../types.js';

/** Validates endpoint and throws when the contract is violated. */
export function requireEndpoint(endpoint: string | undefined): string {
	if (!endpoint) throw new Error('eXact endpoint is not configured');
	return endpoint;
}

/** Performs the endpoint for operation domain operation. */
export function endpointForOperation(
	client: ExactClient,
	type: ExactInvocationKind,
	id: string
): string | undefined {
	if (type === 'invoke') return client.endpoints?.invocations?.[id] ?? client.endpoint;
	return client.endpoints?.boundaries?.[id] ?? client.endpoint;
}

/** Performs the transport for endpoint domain operation. */
export function transportForEndpoint(
	options: HydrateOptions,
	endpoint: string
): { fetch?: FetchLike; headers?: Record<string, string> } {
	const transport = options.transports?.[endpoint];
	return {
		fetch: transport?.fetch ?? options.fetch,
		headers: {
			...(options.headers ?? {}),
			...(transport?.headers ?? {}),
			...(options.binding ? { 'X-Exact-Binding': options.binding } : {}),
			...(options.buildKey ? { 'X-Exact-Build': options.buildKey } : {})
		}
	};
}
