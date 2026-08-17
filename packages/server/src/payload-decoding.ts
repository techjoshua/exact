import type { ExactInvocationRequest, ExactServerContext } from './types.js';

/** Validates and normalizes one application-owned operation payload before authorization. */
export type ExactPayloadDecoder = (
	payload: unknown,
	input: ExactInvocationRequest,
	context: ExactServerContext
) => unknown | Promise<unknown>;

/** Associates manual invocation and refresh identities with business-payload decoders. */
export type ExactPayloadDecoders = Readonly<{
	invocations?: Readonly<Record<string, ExactPayloadDecoder>>;
	boundaries?: Readonly<Record<string, ExactPayloadDecoder>>;
}>;
