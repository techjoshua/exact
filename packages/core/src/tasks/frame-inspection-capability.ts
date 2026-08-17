import type { ExactRuntimeInspectionEventKind } from '@exactjs/devtools-protocol';
import type { TaskFrameRecord } from './frame-contracts.js';

/** Optional observation retained only by inspection-enabled task-frame transitions. */
export type TaskFrameEventObservation =
	| Readonly<{ kind: 'start'; arguments?: readonly unknown[] }>
	| Readonly<{
			kind: 'outcome';
			status: 'settled' | 'failed' | 'cancelled';
			value: unknown;
	  }>;

type TaskFrameInspectionCapability = Readonly<{
	publish(
		frame: TaskFrameRecord,
		kind: ExactRuntimeInspectionEventKind,
		reason?: unknown,
		observation?: TaskFrameEventObservation
	): void;
	attached(frame: TaskFrameRecord): boolean;
}>;

let capability: TaskFrameInspectionCapability | undefined;

/** Installs task-frame diagnostics when an inspection owner is actually constructed. */
export function installTaskFrameInspectionCapability(next: TaskFrameInspectionCapability): void {
	capability ??= next;
}

/** Publishes through the optional diagnostic capability without retaining its implementation. */
export function publishTaskFrameEvent(
	frame: TaskFrameRecord,
	kind: ExactRuntimeInspectionEventKind,
	reason?: unknown,
	observation?: TaskFrameEventObservation
): void {
	capability?.publish(frame, kind, reason, observation);
}

/** Reports attachment without loading task snapshot and preview machinery in production builds. */
export function taskFrameInspectionAttached(frame: TaskFrameRecord): boolean {
	return capability?.attached(frame) ?? false;
}
