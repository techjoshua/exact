import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { resolveNativeCompilerExecutable } from './executable.js';
import {
	nativeCompilerProtocolVersion,
	type NativeCompilerRequest,
	type NativeCompilerResponse
} from './process-contracts.js';

/** Options for the nonblocking native transport used by editor workloads. */
export type ExactNativeLanguageClientOptions = Readonly<{
	executable?: string;
}>;

/** Asynchronous transport contract for a retained native language session. */
export interface ExactNativeLanguageClient {
	request<T extends NativeCompilerResponse = NativeCompilerResponse>(
		request: NativeCompilerRequest,
		signal?: AbortSignal
	): Promise<T>;
	dispose(): Promise<void>;
}

/**
 * Owns a native compiler subprocess without blocking the caller's event loop.
 *
 * Requests are serialized because one native project session is mutation
 * ordered. Cancellation fences the response; the process remains usable and
 * subsequent requests continue after the native phase settles.
 */
export class NativeCompilerLanguageClient implements ExactNativeLanguageClient {
	private readonly child: ChildProcessWithoutNullStreams;
	private readonly lines: Interface;
	private readonly pendingLines: Array<{
		resolve(line: string): void;
		reject(error: Error): void;
	}> = [];
	private readonly queuedLines: string[] = [];
	private tail: Promise<void> = Promise.resolve();
	private failed: Error | undefined;
	private disposed = false;

	constructor(options: ExactNativeLanguageClientOptions = {}) {
		this.child = spawn(options.executable ?? resolveNativeCompilerExecutable(), [], {
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true
		});
		this.lines = createInterface({ input: this.child.stdout });
		this.lines.on('line', (line) => {
			const pending = this.pendingLines.shift();
			if (pending) pending.resolve(line);
			else this.queuedLines.push(line);
		});
		this.child.once('error', (error) => this.fail(error));
		this.child.once('exit', (code, signal) => {
			if (!this.disposed)
				this.fail(
					new Error(`Native compiler exited with ${code ?? signal ?? 'an unknown status'}`)
				);
		});
	}

	/** Sends one serialized request and rejects results cancelled by their owner. */
	request<T extends NativeCompilerResponse = NativeCompilerResponse>(
		request: NativeCompilerRequest,
		signal?: AbortSignal
	): Promise<T> {
		this.assertActive();
		if (signal?.aborted) return Promise.reject(abortError());
		let resolveResult!: (value: T) => void;
		let rejectResult!: (reason: unknown) => void;
		const result = new Promise<T>((resolve, reject) => {
			resolveResult = resolve;
			rejectResult = reject;
		});
		this.tail = this.tail.then(async () => {
			try {
				this.assertActive();
				if (signal?.aborted) throw abortError();
				this.child.stdin.write(`${JSON.stringify(request)}\n`);
				const raw = await this.nextLine();
				const response = JSON.parse(raw) as NativeCompilerResponse;
				validateResponse(response);
				if (response.error) throw new Error(response.error);
				if (signal?.aborted) throw abortError();
				resolveResult(response as T);
			} catch (error) {
				rejectResult(error);
			}
		});
		return result;
	}

	/** Releases the native session and rejects all future work. */
	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.lines.close();
		this.rejectPending(new Error('This eXact native language client has been disposed'));
		if (this.child.exitCode === null) {
			this.child.stdin.write(`${JSON.stringify({ kind: 'shutdown' })}\n`);
			this.child.kill();
		}
		await this.tail.catch(() => undefined);
	}

	private nextLine(): Promise<string> {
		const queued = this.queuedLines.shift();
		if (queued !== undefined) return Promise.resolve(queued);
		if (this.failed) return Promise.reject(this.failed);
		return new Promise((resolve, reject) => this.pendingLines.push({ resolve, reject }));
	}

	private fail(error: Error): void {
		this.failed = error;
		this.rejectPending(error);
	}

	private rejectPending(error: Error): void {
		for (const pending of this.pendingLines.splice(0)) pending.reject(error);
	}

	private assertActive(): void {
		if (this.disposed) throw new Error('This eXact native language client has been disposed');
		if (this.failed) throw this.failed;
	}
}

function validateResponse(response: NativeCompilerResponse): void {
	if (response.protocolVersion !== nativeCompilerProtocolVersion) {
		throw new Error(
			`Native compiler protocol ${response.protocolVersion || '<missing>'} is incompatible with ${nativeCompilerProtocolVersion}`
		);
	}
	if (!response.analysis || !Array.isArray(response.diagnostics))
		throw new Error('Native compiler returned an invalid language response');
}

function abortError(): Error {
	const error = new Error('The eXact language request was cancelled');
	error.name = 'AbortError';
	return error;
}
