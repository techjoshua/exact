/** Public read-only Chromium/CDP inspection adapter facade. */
export {
	connectExactDevtoolsAgent,
	type ExactDevtoolsAgentConnection
} from './agent.js';
export {
	connectExactCdp,
	type ExactCdpConnectionOptions,
	type ExactCdpTransport
} from './cdp.js';
