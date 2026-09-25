import { createContext } from '@exactjs/core';
import { defineExactOperationContract } from '@exactjs/server';

const Application = createContext('native.application', { scope: 'application', reactive: false });
const Local = createContext('native.request', { scope: 'request', reactive: false });

/** Shared dispatch/security/context fixture, executed inside each actual runtime. */
export function operationFixture(control) {
	const state = { initialized: 0, executed: 0, created: [], disposed: [] };
	const names = ['echo', 'context', 'failure', 'unsafe'];
	const context = {
		contract: {
			version: 1,
			endpoint: '/operations',
			invocations: Object.fromEntries(names.map((id) => [id, defineExactOperationContract(id)])),
			boundaries: {}
		},
		logger: { log() {} },
		applicationContexts: [
			[
				Application,
				{
					create() {
						state.initialized++;
						return { prefix: 'application' };
					}
				}
			]
		],
		requestContexts: [
			[
				Local,
				{
					create(scope) {
						const id = scope.request.traceId;
						state.created.push(id);
						return { id, signal: scope.signal };
					},
					dispose(value) {
						state.disposed.push({ id: value.id, aborted: value.signal.aborted });
					}
				}
			]
		],
		authorize(request) {
			return (
				(typeof request.headers.get === 'function'
					? request.headers.get('x-deny')
					: request.headers['x-deny']) !== 'request'
			);
		},
		validateCsrf(request) {
			return (
				(typeof request.headers.get === 'function'
					? request.headers.get('x-deny')
					: request.headers['x-deny']) !== 'csrf'
			);
		},
		authorizeOperation(request) {
			return (
				(typeof request.headers.get === 'function'
					? request.headers.get('x-deny')
					: request.headers['x-deny']) !== 'operation'
			);
		},
		payloadDecoders: {
			invocations: Object.fromEntries(
				names.map((id) => [
					id,
					(payload) => {
						if (!payload || typeof payload !== 'object' || Array.isArray(payload))
							throw new TypeError('Expected object');
						return payload;
					}
				])
			)
		},
		invocations: {
			echo(input) {
				state.executed++;
				return { value: input.payload };
			},
			async context(input, scope) {
				state.executed++;
				const local = scope.contexts.getSync(Local);
				const app = scope.contexts.getSync(Application);
				if (input.payload.gate) {
					const response = await fetch(control + '/gate?id=' + input.payload.gate, {
						signal: scope.signal
					});
					await response.text();
				}
				scope.requestContext.setHeader('x-native-request', local.id);
				return { value: { id: local.id, prefix: app.prefix, aborted: local.signal.aborted } };
			},
			failure() {
				state.executed++;
				throw new Error('private server failure sentinel');
			},
			unsafe() {
				state.executed++;
				return { patches: [{ type: 'replace', id: 'root', html: '<script>unsafe</script>' }] };
			}
		}
	};
	return { context, state };
}
