import type { connectExactDevtoolsAgent } from '../agent.js';
import type { ExactCdpTransport } from '../cdp.js';

/** Checks untrusted page connection results and cleanup of partially acquired CDP resources. */
export async function verifyAgentSessionFailures(
	connect: typeof connectExactDevtoolsAgent
): Promise<void> {
	for (const result of [undefined, null, [], {}, { id: '' }, { id: 1 }]) {
		const methods: string[] = [];
		let listening = false;
		let closed = 0;
		const transport: ExactCdpTransport = {
			async request<Result>(method: string) {
				methods.push(method);
				if (method === 'Runtime.evaluate') return { result: { objectId: 'hook' } } as Result;
				if (method === 'Runtime.callFunctionOn') return { result: { value: result } } as Result;
				return {} as Result;
			},
			onEvent() {
				listening = true;
				return () => {
					listening = false;
				};
			},
			async close() {
				closed++;
			}
		};
		let failed = false;
		let unexpected: Awaited<ReturnType<typeof connect>> | undefined;
		try {
			unexpected = await connect({ transport });
		} catch {
			failed = true;
		}
		const cleaned =
			closed === 1 &&
			!listening &&
			methods.includes('Runtime.removeBinding') &&
			methods.includes('Runtime.releaseObjectGroup');
		if (unexpected) await unexpected.disconnect();
		if (!failed || !cleaned) throw new Error('Invalid page session escaped connection cleanup');
	}
}

/** Releases evaluated page objects when a later binding registration fails. */
export async function verifyAgentBindingFailure(
	connect: typeof connectExactDevtoolsAgent
): Promise<void> {
	for (const stage of ['binding', 'events', 'connect', 'unsubscribe']) {
		const failure = new Error('setup unavailable');
		const methods: string[] = [];
		let closed = 0;
		const transport: ExactCdpTransport = {
			async request<Result>(method: string) {
				methods.push(method);
				if (method === 'Runtime.evaluate') return { result: { objectId: 'hook' } } as Result;
				if (
					(stage === 'binding' && method === 'Runtime.addBinding') ||
					((stage === 'connect' || stage === 'unsubscribe') && method === 'Runtime.callFunctionOn')
				)
					throw failure;
				return {} as Result;
			},
			onEvent() {
				if (stage === 'events') throw failure;
				return () => {
					if (stage === 'unsubscribe') throw new Error('unsubscribe failed');
				};
			},
			async close() {
				closed++;
			}
		};
		let caught: unknown;
		try {
			await connect({ transport });
		} catch (error) {
			caught = error;
		}
		if (caught !== failure || closed !== 1 || !methods.includes('Runtime.releaseObjectGroup'))
			throw new Error('Failed binding leaked its evaluated object group');
	}
}

/** Completes disconnect cleanup even when an unsubscribe fails with a falsey reason. */
export async function verifyAgentDisconnectFailures(
	connect: typeof connectExactDevtoolsAgent
): Promise<void> {
	for (const failure of [null, false, new Error('unsubscribe failed')]) {
		const methods: string[] = [];
		let closed = 0;
		const transport: ExactCdpTransport = {
			async request<Result>(method: string, params: Record<string, unknown> = {}) {
				methods.push(method);
				if (method === 'Runtime.evaluate') return { result: { objectId: 'hook' } } as Result;
				if (
					method === 'Runtime.callFunctionOn' &&
					String(params.functionDeclaration).includes('this.connect')
				)
					return { result: { value: { id: 'session' } } } as Result;
				return {} as Result;
			},
			onEvent() {
				return () => {
					throw failure;
				};
			},
			async close() {
				closed++;
				throw new Error('close failed');
			}
		};
		const agent = await connect({ transport });
		let caught: unknown = Symbol('not rejected');
		try {
			await agent.disconnect();
		} catch (error) {
			caught = error;
		}
		await agent.disconnect();
		if (caught !== failure || closed !== 1 || !methods.includes('Runtime.releaseObjectGroup'))
			throw new Error('Disconnect failure stopped cleanup or lost primary identity');
		if (!agent.subscribe({ protocol: 1, sessionId: 'session' }, () => {}).closed)
			throw new Error('Disconnected agent accepted a subscription');
	}
}
