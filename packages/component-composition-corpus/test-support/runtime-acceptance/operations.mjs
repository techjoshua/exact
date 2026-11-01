import { registerReactiveListKey } from '@exactjs/reactive';
import { invocationCollectionValue } from '../invocation-collection-journey.js';
import { createContext } from '@exactjs/core';
import {
	defineExactOperationContract,
	handleExactRequest,
	createExactServerDebugRuntime,
	exactResponseToFetchResponse
} from '@exactjs/server';
import { verifyDebugQueryLifetime } from '../debug-query-lifetime-journey.js';
import { verifyDebugAuditLifetime } from '../debug-audit-journey.js';

const Application = createContext('native.application', { scope: 'application', reactive: false });
const Local = createContext('native.request', { scope: 'request', reactive: false });

/** Shared dispatch/security/context fixture, executed inside each actual runtime. */
export function operationFixture(control) {
	const state = { initialized: 0, executed: 0, hookCalls: 0, created: [], disposed: [] };
	const names = ['echo', 'context', 'failure', 'unsafe', 'serialization', 'context-write'];
	const context = {
		contract: {
			version: 1,
			endpoint: '/operations',
			invocations: Object.fromEntries(
				names.map((id) => [
					id,
					defineExactOperationContract(
						id,
						id === 'context-write' ? { contextWrites: ['StatusContext'] } : {}
					)
				])
			),
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
			'context-write'() {
				state.executed++;
				return { contexts: { StatusContext: { message: 'ready' } }, value: 42 };
			},
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
			serialization(input) {
				state.executed++;
				const hook = () => {
					state.hookCalls++;
					return Infinity;
				};
				const kind = input.payload.kind;
				if (kind === 'debug-query-lifetime') {
					return (async () => {
						for (const retirement of ['session', 'runtime', 'abort', 'pre-abort'])
							await verifyDebugQueryLifetime(
								{ handleExactRequest, createExactServerDebugRuntime, exactResponseToFetchResponse },
								retirement
							);
						for (const mode of [
							'session',
							'runtime',
							'abort',
							'throw',
							'async',
							'pending',
							'resolved',
							'value',
							'thenable',
							'throwing-then'
						])
							await verifyDebugAuditLifetime(
								{ handleExactRequest, createExactServerDebugRuntime, exactResponseToFetchResponse },
								mode
							);
						return { value: { checked: true } };
					})();
				}
				if (kind === 'native-collections') {
					const value = invocationCollectionValue();
					registerReactiveListKey(value.rows, (item) => item.id, 'native-collections', 'member:id');
					return { value };
				}
				if (kind === 'shared-siblings') {
					const shared = { count: 1 };
					return { value: { left: shared, right: shared, rows: [shared, shared] } };
				}
				if (kind === 'ancestor-cycle') {
					const value = {};
					value.self = value;
					return { value };
				}
				const value =
					kind === 'object-json'
						? Object.defineProperty({}, 'toJSON', { value: hook })
						: kind === 'array-json'
							? Object.defineProperty([], 'toJSON', { get: hook })
							: kind === 'hidden-index'
								? Object.defineProperty([0], '0', { get: hook, enumerable: false })
								: kind === 'map-iterator'
									? Object.defineProperty(new Map([['safe', 1]]), Symbol.iterator, { get: hook })
									: kind === 'set-iterator'
										? Object.defineProperty(new Set([1]), Symbol.iterator, { get: hook })
										: kind === 'hidden-data'
											? Object.defineProperty([0], '0', { value: 'safe', enumerable: false })
											: new Array(3);
				return { value };
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
