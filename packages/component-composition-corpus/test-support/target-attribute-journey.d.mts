/** Semantic nodes retained across adoption, updates and disposal. */
export interface TargetAttributeOwnershipTargets {
	owned: HTMLButtonElement;
	fixed: HTMLButtonElement;
	advance: HTMLButtonElement;
}
/** Captures the server-rendered semantic targets before adoption. */
export function captureTargetAttributeOwnership(root?: ParentNode): TargetAttributeOwnershipTargets;
/** Verifies two retained transitions and authored attribute precedence. */
export function verifyTargetAttributeOwnership(
	root?: ParentNode,
	targets?: TargetAttributeOwnershipTargets
): Promise<void>;
/** Verifies that detached controls no longer mutate their former target. */
export function verifyTargetAttributeOwnershipDisposed(
	targets: TargetAttributeOwnershipTargets
): Promise<void>;
