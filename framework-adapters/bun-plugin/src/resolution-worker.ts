import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

/** Owns one resolution-only Bun subprocess per build generation, including timeout and teardown. */
export class BunResolutionWorker {
	#child?: ChildProcessWithoutNullStreams;
	#closed?: Promise<void>;
	#disposed = false;
	#nextId = 0;
	#stderr = '';
	readonly #pending = new Map<
		number,
		{
			resolve(value: unknown): void;
			reject(error: Error): void;
			timer?: ReturnType<typeof setTimeout>;
		}
	>();

	/** Submits a provider lookup without evaluating its implementation; failures reject the caller. */
	resolve(configuration: Record<string, unknown>): Promise<unknown> {
		if (this.#disposed) return Promise.reject(new Error('Bun resolution worker is disposed'));
		const child = this.#child ?? this.#start();
		const id = ++this.#nextId;
		return new Promise((resolve, reject) => {
			this.#pending.set(id, { resolve, reject });
			this.#armHead();
			child.stdin.write(`${JSON.stringify({ id, ...configuration })}\n`, (error) => {
				if (error) this.#fail(error);
			});
		});
	}

	/** Stops the owned subprocess and settles outstanding lookups before disposal completes. */
	async dispose(): Promise<void> {
		this.#fail(new Error('Bun resolution worker disposed'));
		await this.#closed;
	}

	#start(): ChildProcessWithoutNullStreams {
		const filename = import.meta.url.endsWith('.ts')
			? './build-resolver-worker.ts'
			: './build-resolver-worker.js';
		const child = spawn(process.execPath, [fileURLToPath(new URL(filename, import.meta.url))], {
			stdio: 'pipe'
		});
		this.#child = child;
		this.#closed = new Promise((resolve) =>
			child.once('close', () => {
				this.#fail(new Error(`Bun resolution worker exited: ${this.#stderr}`));
				resolve();
			})
		);
		child.on('error', (error) => this.#fail(error));
		child.stdin.on('error', (error) => this.#fail(error));
		child.stderr.on('data', (chunk) => {
			this.#stderr = (this.#stderr + String(chunk)).slice(-8192);
		});
		const lines = createInterface({ input: child.stdout });
		lines.on('line', (line) => {
			try {
				const value: unknown = JSON.parse(line);
				if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'number')
					throw new Error('Invalid Bun resolution worker response');
				const pending = this.#pending.get(value.id);
				if (!pending) throw new Error('Unknown Bun resolution request');
				this.#pending.delete(value.id);
				clearTimeout(pending.timer);
				pending.resolve(value);
				this.#armHead();
			} catch (error) {
				this.#fail(error instanceof Error ? error : new Error(String(error)));
			}
		});
		child.once('close', () => lines.close());
		return child;
	}

	/** The subprocess handles requests serially; queue wait must not consume execution time. */
	#armHead(): void {
		const head = this.#pending.values().next().value;
		if (head && !head.timer)
			head.timer = setTimeout(() => {
				this.#fail(new Error('Bun provider resolution timed out'));
			}, 30_000);
	}

	/** A failed protocol or timeout invalidates the generation; no caller retains a hung request. */
	#fail(error: Error): void {
		this.#disposed = true;
		for (const pending of this.#pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.#pending.clear();
		if (this.#child?.exitCode === null) this.#child.kill('SIGKILL');
	}
}
