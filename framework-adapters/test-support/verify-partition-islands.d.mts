/** Retained targets, with the opaque spread's element created during eager activation. */
export interface PartitionIslandTargets {
	event: HTMLInputElement;
	dormant: HTMLInputElement;
	method: HTMLInputElement;
	paths: HTMLButtonElement;
	opaque?: HTMLButtonElement;
}
/** Captures the four finite server fallbacks before activation. */
export function capturePartitionIslands(container: Element): PartitionIslandTargets;
/** Verifies adoption and interactions, then records the opaque target for disposal checks. */
export function verifyPartitionIslands(
	container: Element,
	targets: PartitionIslandTargets
): Promise<void>;
/** Verifies that retained targets stop invoking their disposed owners. */
export function verifyPartitionIslandsDisposed(targets: PartitionIslandTargets): Promise<void>;
