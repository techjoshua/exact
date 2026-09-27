import type { ActivityMode, Component } from '@exactjs/core';

/** Independently owned roots sharing one lazy component import. */
export const lazyActivityOwners = new Map<string, Component<{ mode: ActivityMode }>>();
/** Records each candidate instance, including discarded Suspense attempts. */
export const lazyActivitySetups: string[] = [];
/** Records disposal of resolved component instances. */
export const lazyActivityUnmounts: string[] = [];
let release!: () => void;
/** Holds module evaluation while one consumer parks. */
export const lazyActivityGate = new Promise<void>((resolve) => {
	release = resolve;
});
/** Completes the shared import without changing any consumer's lifetime. */
export function releaseLazyActivity() {
	release();
}
