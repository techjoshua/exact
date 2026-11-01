import type { ExactPartitionInstance } from '@exactjs/hydrate';
/** Checks detached observations through the public partition inspector. */
export function verifyPartitionObservations(api: {
	inspect(
		container: Element,
		options: { executionRoot: string; buildKey: string }
	): readonly ExactPartitionInstance[];
}): true;
