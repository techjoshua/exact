import { beforeEach, describe, expect, it, vi } from 'vitest';

const workerState = vi.hoisted(() => ({
	mode: 'protocol-mismatch' as 'protocol-mismatch' | 'startup-error' | 'timeout',
	closeStalls: false,
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
