import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { nativeExecutableSlotsVersion } from './process-executable-selection.js';

const workerState = vi.hoisted(() => ({
	mode: 'protocol-mismatch' as 'protocol-mismatch' | 'startup-error' | 'timeout',
	closeStalls: false,
	response: undefined as Record<string, unknown> | undefined,
	instances: [] as Array<{ messages: string[]; terminated: boolean }>
}));

vi.mock('node:worker_threads', () => ({
	Worker: class FakeWorker {
		readonly header: Int32Array;
		readonly payload: Uint8Array;
		readonly messages: string[] = [];
		terminated = false;

		constructor(_url: URL, options: { workerData: { memory: SharedArrayBuffer } }) {
			this.header = new Int32Array(options.workerData.memory, 0, 4);
			this.payload = new Uint8Array(options.workerData.memory, 4 * Int32Array.BYTES_PER_ELEMENT);
			workerState.instances.push(this);
			if (workerState.mode === 'startup-error') {
				this.publish(3, 'synthetic startup failure');
			} else {
				Atomics.store(this.header, 0, 0);
				Atomics.notify(this.header, 0);
			}
		}

		postMessage(message: string): void {
			this.messages.push(message);
			if (message === 'close') {
				if (workerState.closeStalls) return;
				Atomics.store(this.header, 0, 4);
				Atomics.notify(this.header, 0);
				return;
			}
			if (workerState.response) {
				this.publish(2, JSON.stringify(workerState.response));
				return;
			}
			if (workerState.mode === 'timeout') return;
			this.publish(2, JSON.stringify({ protocolVersion: 999 }));
		}

		unref(): void {}

		terminate(): Promise<number> {
			this.terminated = true;
			return Promise.resolve(0);
		}

		private publish(state: number, value: string): void {
			const encoded = new TextEncoder().encode(value);
			this.payload.set(encoded);
			Atomics.store(this.header, 2, encoded.byteLength);
			Atomics.store(this.header, 0, state);
			Atomics.notify(this.header, 0);
		}
	}
}));

import { NativeCompilerProcess } from './process.js';

describe('native compiler process construction', () => {
	beforeEach(() => {
		workerState.instances.length = 0;
		workerState.mode = 'protocol-mismatch';
		workerState.closeStalls = false;
		workerState.response = undefined;
	});

	it('closes its provisional worker when startup fails', () => {
		workerState.mode = 'startup-error';

		expect(() => new NativeCompilerProcess({ executable: 'synthetic-native-compiler' })).toThrow(
			'synthetic startup failure'
		);

		expect(workerState.instances[0]).toMatchObject({ messages: ['close'], terminated: false });
	});

	it('closes its provisional worker when version negotiation fails', () => {
		expect(() => new NativeCompilerProcess({ executable: 'synthetic-native-compiler' })).toThrow(
			/protocol 999/
		);

		expect(workerState.instances[0]).toMatchObject({
			messages: ['request', 'close'],
			terminated: false
		});
	});

	it('closes its provisional worker when version negotiation times out', () => {
		workerState.mode = 'timeout';

		expect(
			() =>
				new NativeCompilerProcess({
					executable: 'synthetic-native-compiler',
					timeoutMs: 1
				})
		).toThrow('timed out during version');

		expect(workerState.instances[0]).toMatchObject({
			messages: ['request', 'close'],
			terminated: false
		});
	});

	it('identifies the timed-out source request and closes its worker', () => {
		workerState.response = validWorkerResponse();
		const compiler = new NativeCompilerProcess({
			executable: 'synthetic-native-compiler',
			timeoutMs: 1
		});
		workerState.response = undefined;
		workerState.mode = 'timeout';
		expect(() =>
			compiler.request({ kind: 'compile', id: '/project/a file.ts', source: 'export {}' })
		).toThrow('timed out during compile for /project/a file.ts');
		expect(workerState.instances[0]!.messages).toEqual(['request', 'request', 'close']);
		expect(() => compiler.request({ kind: 'version' })).toThrow('disposed');
		compiler.dispose();
		expect(workerState.instances[0]!.messages).toEqual(['request', 'request', 'close']);
	});

	it.each([
		['protocol-mismatch', 'protocol 999'],
		['startup-error', 'synthetic startup failure'],
		['timeout', 'timed out during version']
	] as const)('preserves %s as the cause when shutdown is unconfirmed', (mode, message) => {
		workerState.mode = mode;
		workerState.closeStalls = true;
		expect(
			() =>
				new NativeCompilerProcess({
					executable: 'synthetic-native-compiler',
					timeoutMs: 1
				})
		).toThrow(
			expect.objectContaining({
				message: 'Native compiler shutdown did not confirm child exit',
				cause: expect.objectContaining({ message: expect.stringContaining(message) })
			})
		);
		expect(workerState.instances[0]).toMatchObject({ terminated: false });
		expect(
			workerState.instances[0]!.messages.filter((message) => message === 'close')
		).toHaveLength(1);
	});
});

// Same-protocol binaries can ignore optional fields. A successful response alone
// cannot establish that the requested executable graph was installed.
describe('native executable selection acknowledgement', () => {
	it.each(['missing', 'generation', 'revision', 'target', 'matching'] as const)(
		'requires the requested snapshot: %s',
		(mode) => {
			workerState.closeStalls = false;
			const selected = {
				generation: 3,
				revision: 'config-3',
				target: 'default' as const,
				modules: [],
				edges: []
			};
			workerState.response = validWorkerResponse();
			const process = new NativeCompilerProcess({ executable: 'synthetic-native-compiler' });
			try {
				// Ordinary requests remain usable without this optional internal contract.
				expect(process.request({ kind: 'version' }).backendVersion).toBe('1.0.0');
				const ack = {
					generation: selected.generation,
					revision: selected.revision,
					target: selected.target as string
				};
				if (mode === 'generation') ack.generation++;
				if (mode === 'revision') ack.revision = 'stale';
				if (mode === 'target') ack.target = 'client';
				if (mode !== 'missing') workerState.response.executableSelection = ack;
				const request = () =>
					process.request({ kind: 'synchronize', executableSelection: selected });
				if (mode === 'matching') expect(request().executableSelection).toEqual(ack);
				else expect(request).toThrow('did not acknowledge the executable selection snapshot');
			} finally {
				process.dispose();
				workerState.response = undefined;
			}
		}
	);
});

/** Builds only the process envelope required by the transport validation tests. */
function validWorkerResponse(): Record<string, unknown> {
	return {
		protocolVersion: '1.0.0',
		typescriptVersion: 'test',
		backendVersion: '1.0.0',
		diagnostics: [],
		analysis: {
			...Object.fromEntries(
				[
					'imports',
					'components',
					'jsx',
					'stateAliases',
					'stateReads',
					'stateWrites',
					'reactiveBindings',
					'callables',
					'tasks',
					'exports',
					'symbols',
					'boundaries',
					'continuations',
					'resumptions',
					'rendererEnhancements',
					'assets'
				].map((name) => [name, []])
			),
			requiredCapabilities: { rawHtml: [] },
			policy: { version: 1, subjects: [], flows: [], secretConsumers: [] }
		}
	};
}

describe('native syntax-slot acquisition handshake', () => {
	it.each([undefined, 1, 3])(
		'refuses an unadvertised capability %s before sending syntax work',
		(version) => {
			workerState.closeStalls = false;
			workerState.response = { ...validWorkerResponse(), executableSlotsVersion: version };
			const compiler = new NativeCompilerProcess({ executable: 'synthetic-native-compiler' });
			try {
				const messages = workerState.instances.at(-1)!.messages.length;
				expect(() =>
					compiler.request({ kind: 'executable-slots', id: '/entry.ts', source: '' })
				).toThrow('does not support syntax-only executable slots');
				expect(workerState.instances.at(-1)!.messages).toHaveLength(messages);
				expect(compiler.request({ kind: 'version' }).protocolVersion).toBe('1.0.0');
			} finally {
				compiler.dispose();
				workerState.response = undefined;
			}
		}
	);
	it.each([
		'missing',
		'ordinal',
		'kind',
		'type-only',
		'capability',
		'missing-discovery',
		'discovery-hash',
		'discovery-shape',
		'valid'
	] as const)('validates syntax response %s', (mode) => {
		workerState.closeStalls = false;
		workerState.response = {
			...validWorkerResponse(),
			executableSlotsVersion: nativeExecutableSlotsVersion
		};
		const compiler = new NativeCompilerProcess({ executable: 'synthetic-native-compiler' });
		try {
			const slot = { slot: 0, specifier: './real.js', kind: 'import', typeOnly: false };
			workerState.response.helperSourceDiscovery = {
				sourceRevision: createHash('sha256').update("import './real.js'").digest('hex'),
				completeNegative: true
			};
			if (mode === 'missing-discovery') delete workerState.response.helperSourceDiscovery;
			if (mode === 'discovery-hash')
				workerState.response.helperSourceDiscovery = {
					sourceRevision: 'wrong',
					completeNegative: true
				};
			if (mode === 'discovery-shape')
				workerState.response.helperSourceDiscovery = {
					sourceRevision: createHash('sha256').update("import './real.js'").digest('hex')
				};
			workerState.response.executableSlots =
				mode === 'missing'
					? null
					: [
							{
								...slot,
								...(mode === 'ordinal' ? { slot: 1 } : {}),
								...(mode === 'kind' ? { kind: 'call' } : {}),
								...(mode === 'type-only' ? { typeOnly: undefined } : {})
							}
						];
			if (mode === 'capability') workerState.response.executableSlotsVersion = 3;
			const request = () =>
				compiler.request({
					kind: 'executable-slots',
					id: '/entry.ts',
					source: "import './real.js'"
				});
			if (mode === 'valid') expect(request().executableSlots).toEqual([slot]);
			else expect(request).toThrow('invalid executable syntax slots');
		} finally {
			compiler.dispose();
			workerState.response = undefined;
		}
	});
});

describe('native component helper publication handshake', () => {
	it.each([undefined, 0, 2])('rejects required helper edges without capability %s', (version) => {
		workerState.closeStalls = false;
		workerState.response = { ...validWorkerResponse(), helperPublicationVersion: version };
		const compiler = new NativeCompilerProcess({ executable: 'synthetic-native-compiler' });
		try {
			// Older hosts return the existing required edge but no publication description.
			(workerState.response.analysis as Record<string, unknown>).helperSources = [
				{ moduleSpecifier: './helper.js', sourceFile: '/helper.js' }
			];
			expect(() => compiler.request({ kind: 'analyze', id: '/page.tsx', source: '' })).toThrow(
				/component helper publication.*EXACT_COMPILER_EXECUTABLE/
			);
			// Client-only emission and diagnostics do not publish server companions.
			expect(
				compiler.request({ kind: 'compile', target: 'client', id: '/page.tsx', source: '' })
					.analysis.helperSources
			).toHaveLength(1);
			expect(
				compiler.request({ kind: 'diagnose', id: '/page.tsx', source: '' }).analysis.helperSources
			).toHaveLength(1);
			delete (workerState.response.analysis as Record<string, unknown>).helperSources;
			expect(
				compiler.request({ kind: 'analyze', id: '/ordinary.ts', source: '' }).protocolVersion
			).toBe('1.0.0');
		} finally {
			compiler.dispose();
			workerState.response = undefined;
		}
	});

	it('rejects supplied planning context before sending it to an old host', () => {
		workerState.closeStalls = false;
		workerState.response = validWorkerResponse();
		const compiler = new NativeCompilerProcess({ executable: 'synthetic-native-compiler' });
		try {
			const messages = workerState.instances.at(-1)!.messages.length;
			expect(() =>
				compiler.request({
					kind: 'synchronize',
					helperPublicationContext: [
						{
							owner: '/page.tsx',
							ownerRevision: 'owner',
							component: { start: 0, length: 1 },
							call: { start: 0, length: 1 },
							sourceFile: '/helper.js',
							sourceRevision: 'helper',
							declaration: { start: 0, length: 1 },
							config: 'config',
							selected: true,
							purpose: 'server'
						}
					]
				})
			).toThrow('does not support component helper publication');
			expect(workerState.instances.at(-1)!.messages).toHaveLength(messages);
			expect(compiler.request({ kind: 'version' }).protocolVersion).toBe('1.0.0');
		} finally {
			compiler.dispose();
			workerState.response = undefined;
		}
	});

	it('accepts the advertised capability and preserves helper metadata', () => {
		workerState.closeStalls = false;
		workerState.response = { ...validWorkerResponse(), helperPublicationVersion: 1 };
		const compiler = new NativeCompilerProcess({ executable: 'synthetic-native-compiler' });
		try {
			const edge = { moduleSpecifier: './helper.js', sourceFile: '/helper.js', publication: [] };
			(workerState.response.analysis as Record<string, unknown>).helperSources = [edge];
			expect(
				compiler.request({ kind: 'analyze', id: '/page.tsx', source: '' }).analysis.helperSources
			).toEqual([edge]);
		} finally {
			compiler.dispose();
			workerState.response = undefined;
		}
	});
});
