import type { ExactComponentAuthorizationIdentity } from '@exactjs/core';
import type { ExactPayloadDecoders } from './payload-decoding.js';
import type { ExactExecutorContract, ExactServerContext } from './types.js';

/** Selects the manifest and handlers for one execution root in a retained build. */
export type ExactRemoteRootDispatch = {
	contract: ExactExecutorContract;
	invocations?: ExactServerContext['invocations'];
	refreshBoundaries?: ExactServerContext['refreshBoundaries'];
	payloadDecoders?: ExactPayloadDecoders;
};

/** Registers the executor artifacts retained for one immutable client build. */
export type ExactRemoteBuildRegistration = {
	buildKey: string;
	componentAuthorization?: ExactComponentAuthorizationIdentity;
	roots: Readonly<Record<string, ExactRemoteRootDispatch>>;
};
