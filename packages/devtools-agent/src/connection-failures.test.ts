import { it } from 'vitest';
import { connectExactDevtoolsAgent } from './index.js';
import {
	verifyAgentSessionFailures,
	verifyAgentBindingFailure,
	verifyAgentDisconnectFailures
} from './test-support/connection-failure-journey.js';
it('rejects invalid page sessions and releases partial connection resources', () =>
	verifyAgentSessionFailures(connectExactDevtoolsAgent));
it('releases evaluated objects when partial setup fails', () =>
	verifyAgentBindingFailure(connectExactDevtoolsAgent));

it('completes disconnect cleanup and preserves its first failure', () =>
	verifyAgentDisconnectFailures(connectExactDevtoolsAgent));
