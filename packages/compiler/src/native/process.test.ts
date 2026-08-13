import { beforeEach, describe, expect, it, vi } from 'vitest';

const workerState = vi.hoisted(() => ({
	mode: 'protocol-mismatch' as 'protocol-mismatch' | 'startup-error' | 'timeout' | 'close-timeout',
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
				if (workerState.mode === 'close-timeout') return;
				Atomics.store(this.header, 0, 4);
				Atomics.notify(this.header, 0);
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

	it('force-terminates a worker that does not acknowledge shutdown', () => {
		workerState.mode = 'close-timeout';

		expect(
			() =>
				new NativeCompilerProcess({
					executable: 'synthetic-native-compiler',
					timeoutMs: 1
				})
		).toThrow(/protocol 999/);

		expect(workerState.instances[0]).toMatchObject({
			messages: ['request', 'close'],
			terminated: true
		});
	});
});
