import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { parentPort, workerData } from 'node:worker_threads';

type NativeWorkerData = Readonly<{
	executable: string;
	memory: SharedArrayBuffer;
}>;

const stateIdle = 0;
const stateRequest = 1;
const stateResponse = 2;
const stateError = 3;
const stateClosed = 4;
const headerLength = 4;
const data = workerData as NativeWorkerData;
const header = new Int32Array(data.memory, 0, headerLength);
const payload = new Uint8Array(data.memory, headerLength * Int32Array.BYTES_PER_ELEMENT);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const child = spawn(data.executable, [], {
	stdio: ['pipe', 'pipe', 'inherit'],
	windowsHide: true
});
const lines = createInterface({ input: child.stdout });
const pendingLines: Array<(line: string) => void> = [];
const queuedLines: string[] = [];

lines.on('line', (line) => {
	const pending = pendingLines.shift();
	if (pending) pending(line);
	else queuedLines.push(line);
});

child.once('error', (error) => publishError(error));
child.once('exit', (code, signal) => {
	if (Atomics.load(header, 0) !== stateClosed)
		publishError(new Error(`Native compiler exited with ${code ?? signal ?? 'an unknown status'}`));
});

parentPort?.on('message', (message: 'request' | 'close') => {
	void handleMessage(message);
});

async function handleMessage(message: 'request' | 'close'): Promise<void> {
	if (message === 'close') {
		child.stdin.write(`${JSON.stringify({ kind: 'shutdown' })}\n`);
		child.kill();
		Atomics.store(header, 0, stateClosed);
		Atomics.notify(header, 0);
		return;
	}
	if (Atomics.load(header, 0) !== stateRequest) {
		publishError(new Error('Native compiler worker received a request in an invalid state'));
		return;
	}
	try {
		const requestLength = Atomics.load(header, 1);
		const request = decoder.decode(payload.subarray(0, requestLength));
		child.stdin.write(`${request}\n`);
		const response = await nextLine();
		publish(stateResponse, response);
	} catch (error) {
		publishError(error);
	}
}

Atomics.store(header, 0, stateIdle);
Atomics.notify(header, 0);

function nextLine(): Promise<string> {
	const queued = queuedLines.shift();
	if (queued !== undefined) return Promise.resolve(queued);
	return new Promise((resolve) => pendingLines.push(resolve));
}

function publish(nextState: number, value: string): void {
	const encoded = encoder.encode(value);
	if (encoded.byteLength > payload.byteLength) {
		publishError(
			new Error(
				`Native compiler response is ${encoded.byteLength} bytes; maximum is ${payload.byteLength}`
			)
		);
		return;
	}
	payload.set(encoded);
	Atomics.store(header, 2, encoded.byteLength);
	Atomics.store(header, 0, nextState);
	Atomics.notify(header, 0);
}

function publishError(error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	const encoded = encoder.encode(message);
	const length = Math.min(encoded.byteLength, payload.byteLength);
	payload.set(encoded.subarray(0, length));
	Atomics.store(header, 2, length);
	Atomics.store(header, 0, stateError);
	Atomics.notify(header, 0);
}
