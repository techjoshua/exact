import {
	captureTaskFrame,
	runTaskFrame,
	type TaskFrameExecution,
	type TaskFrameToken
} from '@exactjs/core/framework/task-frames';
import type { AnyGestureCallback, GestureSample } from './contracts.js';

/** Owns task framing and latest-only callback delivery for one gesture session. */
export class GestureCallbackDelivery {
	#abort = new AbortController();
	#execution?: TaskFrameExecution<void>;
	#frame?: TaskFrameToken;
	#settle?: () => void;
	#pending = new Map<string, { running: boolean; latest?: GestureSample }>();
	#generation = 0;

	constructor(private readonly report: (error: unknown) => void) {}

	/** Signal aborted when the current gesture session is cancelled or replaced. */
	get signal(): AbortSignal {
		return this.#abort.signal;
	}

	/** Opens one named nonblocking task frame for a multi-event input session. */
	begin(label: string): void {
		this.#generation++;
		this.#abort = new AbortController();
		const execution = runTaskFrame<void>(
			{
				kind: 'gesture-session',
				label,
				readiness: 'nonblocking',
				priority: 'immediate'
			},
			{
				work: () => {
					this.#frame = captureTaskFrame();
					return new Promise<void>((resolve) => (this.#settle = resolve));
				}
			}
		);
		this.#execution = execution;
		void execution.catch((error) => {
			if (!execution.signal.aborted) this.report(error);
		});
	}

	/** Aborts the current semantic sample signal before cancellation callbacks run. */
	abort(reason: string): void {
		this.#abort.abort(reason);
	}

	/** Settles or cancels the session task and fences queued move delivery. */
	finish(reason: string, cancelled: boolean): void {
		if (cancelled) this.#execution?.cancel(reason);
		else this.#settle?.();
		this.#execution = undefined;
		this.#frame = undefined;
		this.#settle = undefined;
		this.#pending.clear();
		this.#generation++;
	}

	/** Delivers a callback immediately or through the latest-only move queue. */
	invoke(
		kind: string,
		callback: AnyGestureCallback | undefined,
		sample: GestureSample,
		coalesce = false
	): void {
		if (!callback || (coalesce && sample.signal.aborted)) return;
		if (!coalesce) {
			void this.#run(kind, callback, sample);
			return;
		}
		const generation = this.#generation;
		const delivery = this.#pending.get(kind) ?? { running: false };
		this.#pending.set(kind, delivery);
		if (delivery.running) {
			delivery.latest = sample;
			return;
		}
		delivery.running = true;
		void this.#run(kind, callback, sample).finally(() => {
			delivery.running = false;
			const latest = delivery.latest;
			delivery.latest = undefined;
			if (latest && !latest.signal.aborted && generation === this.#generation) {
				this.invoke(kind, callback, latest, true);
			}
		});
	}

	/** Runs one callback as named nonblocking work beneath the active gesture session. */
	async #run(kind: string, callback: AnyGestureCallback, sample: GestureSample): Promise<void> {
		try {
			const execution = runTaskFrame(
				{
					...(this.#frame ? { parent: this.#frame } : {}),
					kind: `gesture-${kind}`,
					label: kind,
					priority: 'immediate',
					readiness: 'nonblocking'
				},
				{ work: async () => await callback(sample) }
			);
			await execution;
		} catch (error) {
			if (!sample.signal.aborted) this.report(error);
		}
	}
}
