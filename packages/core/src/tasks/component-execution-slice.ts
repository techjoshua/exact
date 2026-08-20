import type { AnyTaskFunction } from './contracts.js';
import type { TaskOwnerRecord } from './frame-contracts.js';
import { componentContinuationTaskId } from './component-continuation.js';
import { exactComponentIdentity } from '../component-contracts.js';
import type { AnyComponentInstance } from '../component/contracts.js';

/** Component-keyed transition allowlist active only while an island region is constructed. */
export type ComponentExecutionSlice = ReadonlyMap<string, ReadonlySet<string>>;

let activeSlice: ComponentExecutionSlice | undefined;

/** Constructs one generated island region under its exact transition allowlist. */
export function withComponentExecutionSlice<T>(slice: ComponentExecutionSlice, work: () => T): T {
	const previous = activeSlice;
	activeSlice = slice;
	try {
		return work();
	} finally {
		activeSlice = previous;
	}
}

/** Reports whether the active island slice admits this setup activation site. */
export function componentExecutionSliceAllows(
	owner: TaskOwnerRecord,
	task: AnyTaskFunction
): boolean {
	if (!activeSlice) return true;
	const host = owner.host as AnyComponentInstance | undefined;
	if (!host) return true;
	let componentId: string;
	try {
		componentId = exactComponentIdentity(host.type);
	} catch {
		return true;
	}
	const transitions = activeSlice.get(componentId);
	if (!transitions) return true;
	const transitionId = componentContinuationTaskId(task);
	return transitionId === undefined || transitions.has(transitionId);
}
