import type { MotionDriver, MotionEffect } from './contracts.js';

export { installMotionDriver } from './driver.js';

/** One deterministically controlled animation captured by the testing driver. */
export interface MotionTestPlayback {
	readonly element: Element;
	readonly effect: MotionEffect;
	readonly signal: AbortSignal;
	finish(): void;
	fail(error: unknown): void;
}

/** Deterministic driver whose playbacks settle only when a test advances them. */
export interface MotionTestDriver extends MotionDriver {
	readonly playbacks: readonly MotionTestPlayback[];
	finishAll(): void;
}

/** Creates a deterministic injected motion driver. */
export function createMotionTestDriver(): MotionTestDriver {
	const playbacks: MotionTestPlayback[] = [];
	return {
		playbacks,
		play(element, effect, signal) {
			return new Promise<void>((resolve, reject) => {
				const playback: MotionTestPlayback = {
					element,
					effect,
					signal,
					finish: resolve,
					fail: reject
				};
				playbacks.push(playback);
				if (signal.aborted) reject(signal.reason);
				else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
			});
		},
		finishAll() {
			for (const playback of playbacks) if (!playback.signal.aborted) playback.finish();
		}
	};
}
