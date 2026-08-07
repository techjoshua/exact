import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
	nativeCompilerProtocolVersion,
	type NativeCompilerRequest,
	type NativeCompilerResponse
} from './process-contracts.js';

const stateStarting = -1;
const stateIdle = 0;
const stateRequest = 1;
const stateResponse = 2;
const stateError = 3;
const stateClosed = 4;
const headerLength = 4;
const defaultPayloadBytes = 32 * 1024 * 1024;
const defaultTimeoutMs = 30_000;

/** Options controlling one persistent native compiler subprocess. */
export type NativeCompilerProcessOptions = Readonly<{
	executable: string;
	maxPayloadBytes?: number;
	timeoutMs?: number;
}>;

/**
 * Synchronous facade over one persistent native compiler subprocess.
 *
 * A worker thread owns asynchronous stdio so public synchronous compiler APIs
 * can block without respawning the Go process. Dispose releases both the
 * worker and its child process.
 */
export class NativeCompilerProcess {
	private readonly memory: SharedArrayBuffer;
	private readonly header: Int32Array;
	private readonly payload: Uint8Array;
	private readonly worker: Worker;
	private readonly timeoutMs: number;
	private readonly encoder = new TextEncoder();
	private readonly decoder = new TextDecoder();
	private typescriptVersion: string | undefined;
	private backendVersion: string | undefined;
	private disposed = false;

	constructor(options: NativeCompilerProcessOptions) {
		if (!options.executable) throw new Error('Native compiler executable is required');
		const payloadBytes = options.maxPayloadBytes ?? defaultPayloadBytes;
		if (!Number.isSafeInteger(payloadBytes) || payloadBytes <= 0)
			throw new Error('Native compiler maxPayloadBytes must be a positive integer');
		this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
		if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0)
			throw new Error('Native compiler timeoutMs must be a positive integer');
		this.memory = new SharedArrayBuffer(headerLength * Int32Array.BYTES_PER_ELEMENT + payloadBytes);
		this.header = new Int32Array(this.memory, 0, headerLength);
		this.payload = new Uint8Array(this.memory, headerLength * Int32Array.BYTES_PER_ELEMENT);
		Atomics.store(this.header, 0, stateStarting);
		const worker = nativeWorkerModule();
		this.worker = new Worker(worker, {
			workerData: { executable: options.executable, memory: this.memory }
		});
		this.waitForState(stateStarting, 'start');
		if (Atomics.load(this.header, 0) === stateError) throw this.readError();
		this.worker.unref();
		const version = this.request({ kind: 'version' });
		this.typescriptVersion = version.typescriptVersion;
		this.backendVersion = version.backendVersion;
	}

	/** Executes one request through the existing native process. */
	request(request: NativeCompilerRequest): NativeCompilerResponse {
		this.assertActive();
		if (Atomics.load(this.header, 0) !== stateIdle)
			throw new Error('Native compiler process already has an active request');
		const encoded = this.encoder.encode(JSON.stringify(request));
		if (encoded.byteLength > this.payload.byteLength) {
			throw new Error(
				`Native compiler request is ${encoded.byteLength} bytes; maximum is ${this.payload.byteLength}`
			);
		}
		this.payload.set(encoded);
		Atomics.store(this.header, 1, encoded.byteLength);
		Atomics.store(this.header, 0, stateRequest);
		this.worker.postMessage('request');
		this.waitForState(stateRequest, request.kind);
		const state = Atomics.load(this.header, 0);
		if (state === stateError) {
			const error = this.readError();
			Atomics.store(this.header, 0, stateIdle);
			throw error;
		}
		if (state !== stateResponse)
			throw new Error(`Native compiler entered unexpected state ${state}`);
		const length = Atomics.load(this.header, 2);
		const raw = this.decoder.decode(this.payload.subarray(0, length));
		Atomics.store(this.header, 0, stateIdle);
		const response = JSON.parse(raw) as NativeCompilerResponse;
		if (response.protocolVersion !== nativeCompilerProtocolVersion) {
			throw new Error(
				this.withVersions(
					`Native compiler protocol ${response.protocolVersion || '<missing>'} is incompatible with ${nativeCompilerProtocolVersion}`,
					response
				)
			);
		}
		if (response.error) throw new Error(this.withVersions(response.error, response));
		if (
			typeof response.typescriptVersion !== 'string' ||
			!response.typescriptVersion ||
			typeof response.backendVersion !== 'string' ||
			!response.backendVersion ||
			!Array.isArray(response.diagnostics) ||
			!response.analysis ||
			!Array.isArray(response.analysis.imports) ||
			!Array.isArray(response.analysis.components) ||
			!Array.isArray(response.analysis.jsx) ||
			!Array.isArray(response.analysis.stateAliases) ||
			!Array.isArray(response.analysis.stateReads) ||
			!Array.isArray(response.analysis.stateWrites) ||
			!Array.isArray(response.analysis.reactiveBindings) ||
			!Array.isArray(response.analysis.callables) ||
			!Array.isArray(response.analysis.tasks) ||
			!Array.isArray(response.analysis.exports) ||
			!Array.isArray(response.analysis.symbols) ||
			!Array.isArray(response.analysis.boundaries) ||
			!Array.isArray(response.analysis.continuations) ||
			!Array.isArray(response.analysis.resumptions) ||
			!Array.isArray(response.analysis.rendererEnhancements) ||
			!Array.isArray(response.analysis.requiredCapabilities?.rawHtml) ||
			!Array.isArray(response.analysis.assets) ||
			response.analysis.policy?.version !== 1 ||
			!Array.isArray(response.analysis.policy.subjects) ||
			!Array.isArray(response.analysis.policy.flows) ||
			!Array.isArray(response.analysis.policy.secretConsumers)
		)
			throw new Error(this.withVersions('Native compiler returned an invalid response', response));
		return response;
	}

	/** Releases the worker and native subprocess. */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		const activeState = Atomics.load(this.header, 0);
		this.worker.postMessage('close');
		this.waitForState(activeState, 'close');
		void this.worker.terminate();
	}

	private waitForState(expected: number, operation: string): void {
		const result = Atomics.wait(this.header, 0, expected, this.timeoutMs);
		if (result === 'timed-out') {
			void this.worker.terminate();
			this.disposed = true;
			throw new Error(`Native compiler timed out during ${operation}`);
		}
	}

	private readError(): Error {
		const length = Atomics.load(this.header, 2);
		return new Error(this.withVersions(this.decoder.decode(this.payload.subarray(0, length))));
	}

	private withVersions(message: string, response?: Partial<NativeCompilerResponse>): string {
		const typescript = response?.typescriptVersion ?? this.typescriptVersion ?? '<unavailable>';
		const backend =
			response?.backendVersion ?? this.backendVersion ?? nativeCompilerProtocolVersion;
		return `${message} (TypeScript ${typescript}; eXact native backend ${backend})`;
	}

	private assertActive(): void {
		if (this.disposed || Atomics.load(this.header, 0) === stateClosed)
			throw new Error('Native compiler process has been disposed');
	}
}

function nativeWorkerModule(): URL {
	if (import.meta.url.startsWith('file:')) {
		const emittedWorker = new URL('./process-worker.js', import.meta.url);
		if (emittedWorker.protocol !== 'file:') return fallbackNativeWorkerModule();
		return existsSync(fileURLToPath(emittedWorker))
			? emittedWorker
			: new URL('./process-worker.ts', import.meta.url);
	}
	return fallbackNativeWorkerModule();
}

function fallbackNativeWorkerModule(): URL {
	// Vite's SSR module runner gives imported source modules an HTTP identity.
	// Native compilation still runs in Node, so resolve the repository worker
	// without assuming that transformed import.meta.url is a file URL.
	const candidates = [
		path.resolve(process.cwd(), 'packages/compiler/dist/native/process-worker.js'),
		path.resolve(process.cwd(), 'packages/compiler/src/native/process-worker.ts'),
		path.resolve(process.cwd(), 'dist/native/process-worker.js'),
		path.resolve(process.cwd(), 'src/native/process-worker.ts')
	];
	if (import.meta.url.startsWith('file:')) {
		const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
		candidates.unshift(
			path.resolve(moduleDirectory, 'process-worker.js'),
			path.resolve(moduleDirectory, 'process-worker.ts')
		);
	}
	for (const candidate of candidates) {
		if (existsSync(candidate)) return pathToFileURL(candidate);
	}
	throw new Error(`Cannot resolve the native compiler worker from ${import.meta.url}`);
}
